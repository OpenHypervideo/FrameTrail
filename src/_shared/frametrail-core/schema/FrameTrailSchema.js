/**
 * @module Shared
 */


/**
 * I am FrameTrailSchema: a JSON Schema validator for the schemas in schemas/.
 * I implement the subset of JSON Schema 2020-12 those schemas use (see
 * "Schema Subset" in docs/DATA-MODEL.md) completely, and refuse schemas that
 * use anything else, so a schema cannot ask for a check I would silently skip.
 * I touch neither the DOM nor any FrameTrail instance, so I run in the browser
 * as a plain script (window.FrameTrailSchema) and in Node under require(), for
 * tools and tests.
 *
 *     var validator = FrameTrailSchema.create(schemas);   // the parsed schema documents
 *     validator.validate('hypervideo.schema.json', json);
 *     // → [] when valid, otherwise e.g.
 *     //   [{ path: '/contents/3/body/frametrail:attributes/shape', message: 'must be one of "circle", … ' }]
 *
 * An error's path is a JSON Pointer (RFC 6901) into the validated document;
 * '' is the document itself. A missing property is reported at the path it
 * would have, with "is required".
 *
 * Where no alternative of a oneOf matches, I report the errors of the one that
 * was meant rather than those of every alternative:
 *
 * * Where every alternative is an object that requires the same property and
 *   fixes it to a value of its own with const (frametrail:type, a content
 *   view's type, …), that property picks the alternative. An unknown value is
 *   reported at the property, with the values allowed there.
 * * Otherwise the alternatives whose type fits the value are considered; of
 *   those, the one with the fewest errors (the first, on a tie). When none
 *   fits, the error is the types the alternatives allow.
 *
 * This only decides what is reported. Whether a document is valid is decided
 * as JSON Schema decides it.
 *
 * @class FrameTrailSchema
 * @static
 */

(function(factory) {

    var api = factory();

    if (typeof window !== 'undefined') {
        window.FrameTrailSchema = api;
    }
    if (typeof module === 'object' && module && module.exports) {
        module.exports = api;
    }

})(function() {


    /**
     * The base URI of FrameTrail's schemas: a schema name given to validate()
     * is resolved against it.
     */
    var BASE = 'https://frametrail.org/schemas/1/';

    /**
     * The keywords I implement, by what their value is: a schema, a map of
     * schemas, a list of schemas, or something else.
     */
    var KEYWORDS = {
        '$schema':              'value',
        '$id':                  'value',
        '$defs':                'map',
        '$ref':                 'value',
        'title':                'value',
        'description':          'value',
        'default':              'value',
        'type':                 'value',
        'properties':           'map',
        'required':             'value',
        'additionalProperties': 'schema',
        'items':                'schema',
        'minItems':             'value',
        'maxItems':             'value',
        'enum':                 'value',
        'const':                'value',
        'minimum':              'value',
        'maximum':              'value',
        'pattern':              'value',
        'oneOf':                'list'
    };

    var TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];


    /* ------------------------------------------------------------------ */
    /*  JSON helpers                                                      */
    /* ------------------------------------------------------------------ */

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    // An own property that JSON would write (undefined is not a value in JSON).
    function has(obj, key) {
        return Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined;
    }

    // Equality as JSON sees it: key order does not matter, [] is not {}.
    function sameJSON(a, b) {

        if (a === b) { return true; }
        if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { return false; }
        if (Array.isArray(a) !== Array.isArray(b)) { return false; }

        if (Array.isArray(a)) {
            if (a.length !== b.length) { return false; }
            for (var i = 0; i < a.length; i++) {
                if (!sameJSON(a[i], b[i])) { return false; }
            }
            return true;
        }

        var keysA = Object.keys(a).filter(function(key) { return a[key] !== undefined; }),
            keysB = Object.keys(b).filter(function(key) { return b[key] !== undefined; });

        if (keysA.length !== keysB.length) { return false; }

        for (var k = 0; k < keysA.length; k++) {
            if (!has(b, keysA[k]) || !sameJSON(a[keysA[k]], b[keysA[k]])) { return false; }
        }

        return true;

    }

    // The JSON type of a value as error messages name it (every number is a number).
    function typeOf(value) {
        if (value === null) { return 'null'; }
        if (Array.isArray(value)) { return 'array'; }
        return typeof value;
    }

    function hasType(type, value) {
        switch (type) {
            case 'integer': return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
            case 'number':  return typeof value === 'number' && isFinite(value);
            case 'object':  return isObject(value);
            default:        return typeOf(value) === type;
        }
    }

    function typeList(types) {
        types = [].concat(types);
        return (types.length < 2)
            ? types.join('')
            : types.slice(0, -1).join(', ') + ' or ' + types[types.length - 1];
    }

    function json(value) {
        return JSON.stringify(value);
    }

    // A JSON Pointer reference token (RFC 6901).
    function pointerToken(key) {
        return String(key).replace(/~/g, '~0').replace(/\//g, '~1');
    }

    function error(path, message) {
        return { path: path, message: message };
    }


    /* ------------------------------------------------------------------ */
    /*  References                                                        */
    /* ------------------------------------------------------------------ */

    // A reference resolved against a base URI (RFC 3986, as far as schema ids need it).
    function resolveUri(ref, base) {

        if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) { return ref; }

        var hash     = ref.indexOf('#'),
            path     = (hash >= 0) ? ref.slice(0, hash) : ref,
            fragment = (hash >= 0) ? ref.slice(hash) : '',
            document = base.split('#')[0];

        if (path === '') { return document + fragment; }

        var m        = /^([a-z][a-z0-9+.-]*:\/\/[^\/?#]*)?(.*)$/i.exec(document),
            origin   = m[1] || '',
            joined   = (path.charAt(0) === '/') ? path : m[2].replace(/[^\/]*$/, '') + path,
            segments = [];

        joined.split('/').forEach(function(segment, i, all) {
            if (segment === '.') {
                if (i === all.length - 1) { segments.push(''); }
            } else if (segment === '..') {
                if (segments.length > 1) { segments.pop(); }
                if (i === all.length - 1) { segments.push(''); }
            } else {
                segments.push(segment);
            }
        });

        return origin + segments.join('/') + fragment;

    }


    /**
     * I make a validator for a set of schema documents. Each needs an
     * absolute $id; references between them are resolved against those, and
     * nothing is fetched. I throw when a schema uses a keyword outside the
     * subset, holds a malformed keyword value, or refers to something that is
     * not there.
     *
     * @method create
     * @param {Array} schemas parsed schema documents
     * @param {Object} [options] { base }: what schema names given to validate() are resolved against (default BASE)
     * @return {Object} { validate(schema, data) → [{ path, message }], has(schema) → Boolean }
     */
    function create(schemas, options) {

        var documents      = {},
            base           = (options && options.base) || BASE,
            discriminators = new Map(),
            patterns       = {},
            references     = {};

        (schemas || []).forEach(function(schema) {
            if (!isObject(schema) || typeof schema.$id !== 'string' || !/^[a-z][a-z0-9+.-]*:/i.test(schema.$id)) {
                throw new Error('A schema document needs an absolute $id');
            }
            var id = schema.$id.split('#')[0];
            if (documents[id]) { throw new Error('Two schemas with the $id ' + id); }
            documents[id] = schema;
        });

        // I find the schema a reference points at, or throw.
        function resolve(ref, from) {

            var cacheKey = from + ' ' + ref;

            if (!has(references, cacheKey)) {
                references[cacheKey] = lookup(ref, from);
            }

            return references[cacheKey];

        }

        function lookup(ref, from) {

            var uri      = resolveUri(ref, from),
                hash     = uri.indexOf('#'),
                id       = (hash >= 0) ? uri.slice(0, hash) : uri,
                fragment = (hash >= 0) ? uri.slice(hash + 1) : '',
                node     = documents[id];

            if (node === undefined) { throw new Error('Cannot resolve "' + ref + '" from ' + from + ': no schema ' + id); }
            if (fragment !== '' && fragment.charAt(0) !== '/') { throw new Error('Cannot resolve "' + ref + '" from ' + from + ': only JSON Pointer fragments are supported'); }

            fragment.split('/').slice(1).forEach(function(token) {
                var key = decodeURIComponent(token).replace(/~1/g, '/').replace(/~0/g, '~');
                node = (node !== null && typeof node === 'object' && has(node, key)) ? node[key] : undefined;
                if (node === undefined) { throw new Error('Cannot resolve "' + ref + '" from ' + from); }
            });

            return { schema: node, base: id };

        }

        // I follow a schema that is only a reference to what it refers to.
        function deref(schema, from) {
            var hops = 0;
            while (isObject(schema) && typeof schema.$ref === 'string') {
                if (++hops > 32) { throw new Error('Reference loop at ' + schema.$ref); }
                var target = resolve(schema.$ref, from);
                schema = target.schema;
                from = target.base;
            }
            return { schema: schema, base: from };
        }

        function pattern(source) {
            if (!patterns[source]) { patterns[source] = new RegExp(source, 'u'); }
            return patterns[source];
        }


        /* ---------------------------------------------------------- */
        /*  Checking the schemas                                      */
        /* ---------------------------------------------------------- */

        function checkSchema(schema, id, where) {

            if (typeof schema === 'boolean') { return; }

            var at = ' at ' + id + '#' + where;

            if (!isObject(schema)) { throw new Error('Not a schema' + at); }

            Object.keys(schema).forEach(function(keyword) {

                var value = schema[keyword],
                    place = where + '/' + pointerToken(keyword);

                if (!has(KEYWORDS, keyword)) { throw new Error('Unsupported keyword "' + keyword + '"' + at); }

                switch (keyword) {
                    case 'type':
                        if (![].concat(value).length || [].concat(value).some(function(type) { return TYPES.indexOf(type) < 0; })) {
                            throw new Error('Invalid type ' + json(value) + at);
                        }
                        break;
                    case 'required':
                        if (!Array.isArray(value) || value.some(function(key) { return typeof key !== 'string'; })) {
                            throw new Error('"required" must be a list of names' + at);
                        }
                        break;
                    case 'enum':
                        if (!Array.isArray(value) || !value.length) { throw new Error('"enum" must be a non-empty list' + at); }
                        break;
                    case 'minimum':
                    case 'maximum':
                        if (typeof value !== 'number') { throw new Error('"' + keyword + '" must be a number' + at); }
                        break;
                    case 'minItems':
                    case 'maxItems':
                        if (!hasType('integer', value) || value < 0) { throw new Error('"' + keyword + '" must be a non-negative integer' + at); }
                        break;
                    case 'pattern':
                        if (typeof value !== 'string') { throw new Error('"pattern" must be a string' + at); }
                        try { pattern(value); } catch (e) { throw new Error('Invalid pattern ' + json(value) + at); }
                        break;
                    case '$ref':
                        if (typeof value !== 'string') { throw new Error('"$ref" must be a string' + at); }
                        resolve(value, id);
                        break;
                }

                switch (KEYWORDS[keyword]) {
                    case 'schema':
                        checkSchema(value, id, place);
                        break;
                    case 'map':
                        if (!isObject(value)) { throw new Error('"' + keyword + '" must be an object' + at); }
                        Object.keys(value).forEach(function(key) {
                            checkSchema(value[key], id, place + '/' + pointerToken(key));
                        });
                        break;
                    case 'list':
                        if (!Array.isArray(value) || !value.length) { throw new Error('"' + keyword + '" must be a non-empty list' + at); }
                        value.forEach(function(item, i) { checkSchema(item, id, place + '/' + i); });
                        break;
                }

            });

        }

        Object.keys(documents).forEach(function(id) {
            checkSchema(documents[id], id, '');
        });


        /* ---------------------------------------------------------- */
        /*  Validating                                                */
        /* ---------------------------------------------------------- */

        // The property that tells the alternatives of a oneOf apart, if there
        // is one: every alternative requires it and fixes it with const, each
        // to a different value.
        function discriminator(schema, from) {

            if (discriminators.has(schema)) { return discriminators.get(schema); }

            var branches = schema.oneOf.map(function(branch) { return deref(branch, from).schema; }),
                found    = null;

            var fixes = function(branch, key) {
                return isObject(branch) && isObject(branch.properties) && isObject(branch.properties[key])
                    && has(branch.properties[key], 'const')
                    && Array.isArray(branch.required) && branch.required.indexOf(key) >= 0;
            };

            if (isObject(branches[0]) && isObject(branches[0].properties)) {
                Object.keys(branches[0].properties).some(function(key) {
                    if (!branches.every(function(branch) { return fixes(branch, key); })) { return false; }
                    var values = branches.map(function(branch) { return branch.properties[key]['const']; });
                    if (values.some(function(value, i) { return indexOfJSON(values, value) !== i; })) { return false; }
                    found = { key: key, values: values };
                    return true;
                });
            }

            discriminators.set(schema, found);

            return found;

        }

        function indexOfJSON(list, value) {
            for (var i = 0; i < list.length; i++) {
                if (sameJSON(list[i], value)) { return i; }
            }
            return -1;
        }

        function fewest(results) {
            return results.reduce(function(best, result) {
                return (result.errors.length < best.errors.length) ? result : best;
            }).errors;
        }

        function checkOneOf(schema, from, data, path) {

            var branches   = schema.oneOf,
                key        = discriminator(schema, from),
                candidates = [];

            if (key && isObject(data)) {
                var keyPath = path + '/' + pointerToken(key.key);
                if (!has(data, key.key)) { return [error(keyPath, 'is required')]; }
                key.values.forEach(function(value, i) {
                    if (sameJSON(value, data[key.key])) { candidates.push(i); }
                });
                if (!candidates.length) {
                    return [error(keyPath, 'must be one of ' + key.values.map(json).join(', '))];
                }
            } else {
                candidates = branches.map(function(branch, i) { return i; });
            }

            var results = candidates.map(function(i) {
                return { branch: i, errors: check(branches[i], from, data, path) };
            });

            var matching = results.filter(function(result) { return !result.errors.length; }).length;

            if (matching === 1) { return []; }
            if (matching > 1) { return [error(path, 'must match exactly one of the alternatives, matches ' + matching)]; }

            if (key && isObject(data)) { return fewest(results); }

            var declared = function(i) {
                var target = deref(branches[i], from).schema;
                return (isObject(target) && has(target, 'type')) ? [].concat(target.type) : null;
            };

            var fitting = results.filter(function(result) {
                var types = declared(result.branch);
                return types && types.some(function(type) { return hasType(type, data); });
            });

            if (fitting.length) { return fewest(fitting); }

            var types = [];
            branches.forEach(function(branch, i) {
                (declared(i) || []).forEach(function(type) {
                    if (types.indexOf(type) < 0) { types.push(type); }
                });
            });

            return types.length
                ? [error(path, 'must be ' + typeList(types) + ', is ' + typeOf(data))]
                : fewest(results);

        }

        function check(schema, from, data, path) {

            if (schema === true) { return []; }
            if (schema === false) { return [error(path, 'is not allowed')]; }

            var errors = [];

            if (has(schema, '$ref')) {
                var target = resolve(schema.$ref, from);
                errors = errors.concat(check(target.schema, target.base, data, path));
            }

            if (has(schema, 'type') && ![].concat(schema.type).some(function(type) { return hasType(type, data); })) {
                errors.push(error(path, 'must be ' + typeList(schema.type) + ', is ' + typeOf(data)));
                return errors;
            }

            if (has(schema, 'const') && !sameJSON(schema['const'], data)) {
                errors.push(error(path, 'must be ' + json(schema['const'])));
            }

            if (has(schema, 'enum') && !schema['enum'].some(function(value) { return sameJSON(value, data); })) {
                errors.push(error(path, 'must be one of ' + schema['enum'].map(json).join(', ')));
            }

            if (typeof data === 'number') {
                if (has(schema, 'minimum') && data < schema.minimum) { errors.push(error(path, 'must be >= ' + schema.minimum)); }
                if (has(schema, 'maximum') && data > schema.maximum) { errors.push(error(path, 'must be <= ' + schema.maximum)); }
            }

            if (typeof data === 'string' && has(schema, 'pattern') && !pattern(schema.pattern).test(data)) {
                errors.push(error(path, 'must match the pattern ' + schema.pattern));
            }

            if (Array.isArray(data)) {
                if (has(schema, 'minItems') && data.length < schema.minItems) {
                    errors.push(error(path, 'must have at least ' + schema.minItems + (schema.minItems === 1 ? ' item' : ' items')));
                }
                if (has(schema, 'maxItems') && data.length > schema.maxItems) {
                    errors.push(error(path, 'must have at most ' + schema.maxItems + (schema.maxItems === 1 ? ' item' : ' items')));
                }
                if (has(schema, 'items')) {
                    data.forEach(function(item, i) {
                        errors = errors.concat(check(schema.items, from, item, path + '/' + i));
                    });
                }
            }

            if (isObject(data)) {

                var properties = isObject(schema.properties) ? schema.properties : {};

                (schema.required || []).forEach(function(key) {
                    if (!has(data, key)) { errors.push(error(path + '/' + pointerToken(key), 'is required')); }
                });

                Object.keys(properties).forEach(function(key) {
                    if (has(data, key)) {
                        errors = errors.concat(check(properties[key], from, data[key], path + '/' + pointerToken(key)));
                    }
                });

                if (has(schema, 'additionalProperties')) {
                    Object.keys(data).forEach(function(key) {
                        if (has(properties, key) || !has(data, key)) { return; }
                        errors = errors.concat(check(schema.additionalProperties, from, data[key], path + '/' + pointerToken(key)));
                    });
                }

            }

            if (has(schema, 'oneOf')) {
                errors = errors.concat(checkOneOf(schema, from, data, path));
            }

            return errors;

        }

        // The same error can be found twice, e.g. a required discriminator.
        function unique(errors) {
            var seen = {};
            return errors.filter(function(e) {
                var key = e.path + '\u0000' + e.message;
                if (seen[key]) { return false; }
                seen[key] = true;
                return true;
            });
        }

        return {

            /**
             * I validate a document against a schema.
             * @method validate
             * @param {String} schema the schema's $id, or a reference resolved against the base (e.g. "hypervideo.schema.json", "common.schema.json#/$defs/keyframes")
             * @param {*} data parsed JSON
             * @return {Array} [] when valid, otherwise [{ path, message }]
             */
            validate: function(schema, data) {
                var target = resolve(schema, base);
                return unique(check(target.schema, target.base, data, ''));
            },

            /**
             * I tell whether a schema reference can be resolved.
             * @method has
             * @param {String} schema
             * @return {Boolean}
             */
            has: function(schema) {
                try {
                    resolve(schema, base);
                    return true;
                } catch (e) {
                    return false;
                }
            }

        };

    }


    /* ------------------------------------------------------------------ */

    return {

        BASE:   BASE,
        create: create

    };

});
