/**
 * @module Shared
 */


/**
 * I am FrameTrailQuiz: the rules of a quiz (a resource of type "quiz", see
 * schemas/attributes/quiz.schema.json) apart from how it looks. I touch neither the DOM nor any
 * FrameTrail instance, so I run in the browser as a plain script (window.FrameTrailQuiz) and in Node
 * under require(), for tools and tests.
 *
 * A quiz is answered by one or more voters (the player, paired phones). Their answers are choices:
 * an answer's index (multipleChoice), a list of indices (multiSelect), a step of the scale (rating)
 * or a text (freeText). decide() makes one decision of them, actionOf() says what happens then:
 *
 * * multipleChoice: the answer with the most votes. A tie, and no votes at all, go to the answer
 *   marked as default; without one, a tie goes to the tied answer listed first and no votes to the
 *   first answer. The decided answer's action happens.
 * * the other types: the quiz's onAnswered action happens.
 *
 * An action is { action, target, targetTime, feedback }: action "" (continue playing), "pause"
 * (stay paused), "openUrl", "jumpToTime" (and play on) or "jumpToHypervideo", with the target and
 * time of the hotspot's action model, and a text to show with the result.
 *
 * Quizzes saved before per-answer actions have outcomes instead (onCorrectAnswer, onWrongAnswer,
 * and onAnswered with showText / resumePlayback / jumpForward / jumpBackward): isLegacy() tells,
 * actionOf() reads them, fromLegacy() converts them (the editor does on the first change).
 *
 * @class FrameTrailQuiz
 * @static
 */

(function(factory) {

    var api = factory();

    if (typeof window !== 'undefined') {
        window.FrameTrailQuiz = api;
    }
    if (typeof module === 'object' && module && module.exports) {
        module.exports = api;
    }

})(function() {

    var TYPES = ['multipleChoice', 'multiSelect', 'freeText', 'rating'];

    var ACTIONS = ['', 'pause', 'openUrl', 'jumpToTime', 'jumpToHypervideo'];

    // The longest free text answer kept, in characters.
    var MAX_TEXT = 500;

    // The keys of an action, where it is stored (an answer, onAnswered).
    var ACTION_KEYS = ['action', 'actionTarget', 'actionTargetTime', 'feedback'];


    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function has(obj, key) {
        return isObject(obj) && Object.prototype.hasOwnProperty.call(obj, key);
    }

    function clone(value) {
        return (value === undefined) ? undefined : JSON.parse(JSON.stringify(value));
    }

    function answersOf(attrs) {
        return (isObject(attrs) && Array.isArray(attrs.answers)) ? attrs.answers.filter(isObject) : [];
    }

    function isIndex(value, length) {
        return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0 && value < length;
    }


    /**
     * I return the quiz's question type; an unknown or missing one is multipleChoice.
     * @method questionType
     * @param {Object} attrs
     * @return {String}
     */
    function questionType(attrs) {
        var type = isObject(attrs) ? attrs.questionType : undefined;
        return (TYPES.indexOf(type) >= 0) ? type : 'multipleChoice';
    }

    /**
     * I say whether the quiz's answers are chosen from its list (multipleChoice, multiSelect).
     * @method isChoice
     * @param {Object} attrs
     * @return {Boolean}
     */
    function isChoice(attrs) {
        var type = questionType(attrs);
        return type === 'multipleChoice' || type === 'multiSelect';
    }

    /**
     * I return the steps of a rating quiz's scale (2 to 10, 5 when missing).
     * @method ratingScale
     * @param {Object} attrs
     * @return {Number}
     */
    function ratingScale(attrs) {
        var scale = parseInt(isObject(attrs) ? attrs.ratingScale : undefined, 10);
        return (scale >= 2 && scale <= 10) ? scale : 5;
    }

    /**
     * I say whether the quiz still has the outcomes it was saved with before per-answer actions:
     * no answer and no onAnswered carries an action key.
     * @method isLegacy
     * @param {Object} attrs
     * @return {Boolean}
     */
    function isLegacy(attrs) {
        if (!isObject(attrs)) { return false; }
        var hasAction = answersOf(attrs).some(function(answer) { return has(answer, 'action'); })
                     || has(attrs.onAnswered, 'action');
        return !hasAction;
    }

    /**
     * I return the index of the answer marked as default, or -1. The first one counts when several are.
     * @method defaultIndex
     * @param {Object} attrs
     * @return {Number}
     */
    function defaultIndex(attrs) {
        var answers = answersOf(attrs);
        for (var i = 0; i < answers.length; i++) {
            if (answers[i]['default'] === true) { return i; }
        }
        return -1;
    }

    /**
     * I return a voter's choice in the form the quiz takes, or null when it is not one:
     * multipleChoice an answer's index; multiSelect the chosen indices, sorted, each once (none is
     * an answer too); rating a step from 1 to the scale; freeText the text, trimmed and cut to
     * MAX_TEXT characters, not empty.
     * @method normalizeChoice
     * @param {Object} attrs
     * @param {*} choice
     * @return {*}
     */
    function normalizeChoice(attrs, choice) {

        var answers = answersOf(attrs);

        switch (questionType(attrs)) {
            case 'multiSelect':
                if (!Array.isArray(choice)) { return null; }
                var picked = [];
                choice.forEach(function(index) {
                    if (isIndex(index, answers.length) && picked.indexOf(index) < 0) { picked.push(index); }
                });
                return picked.sort(function(a, b) { return a - b; });
            case 'rating':
                return (typeof choice === 'number' && Math.floor(choice) === choice && choice >= 1 && choice <= ratingScale(attrs)) ? choice : null;
            case 'freeText':
                if (typeof choice !== 'string') { return null; }
                var text = choice.trim().slice(0, MAX_TEXT);
                return text ? text : null;
            default:
                return isIndex(choice, answers.length) ? choice : null;
        }

    }

    /**
     * I say whether a choice is right: for multipleChoice and multiSelect when the quiz marks any
     * answer as correct, else null (nothing to be right about).
     * @method correctOf
     * @param {Object} attrs
     * @param {*} choice a normalized choice
     * @return {Boolean|null}
     */
    function correctOf(attrs, choice) {

        var answers = answersOf(attrs),
            correct = [];

        answers.forEach(function(answer, i) { if (answer.correct === true) { correct.push(i); } });

        if (!correct.length || choice === null || choice === undefined) { return null; }

        switch (questionType(attrs)) {
            case 'multipleChoice':
                return correct.indexOf(choice) >= 0;
            case 'multiSelect':
                return Array.isArray(choice) && choice.length === correct.length
                    && choice.every(function(index) { return correct.indexOf(index) >= 0; });
            default:
                return null;
        }

    }

    /**
     * I count the votes (normalized choices, one per voter): { voters, counts, average, texts }.
     * counts are per answer (multipleChoice, multiSelect) or per step of the scale (rating, index 0
     * is step 1); average is the rating's mean (null without votes); texts the free text answers.
     * @method tally
     * @param {Object} attrs
     * @param {Array} votes
     * @return {Object}
     */
    function tally(attrs, votes) {

        var type   = questionType(attrs),
            result = { voters: 0, counts: [], average: null, texts: [] },
            sum    = 0;

        if (type === 'rating') {
            for (var s = 0; s < ratingScale(attrs); s++) { result.counts.push(0); }
        } else if (type !== 'freeText') {
            answersOf(attrs).forEach(function() { result.counts.push(0); });
        }

        (votes || []).forEach(function(vote) {
            if (vote === null || vote === undefined) { return; }
            result.voters++;
            if (type === 'multipleChoice' && result.counts[vote] !== undefined) {
                result.counts[vote]++;
            } else if (type === 'multiSelect' && Array.isArray(vote)) {
                vote.forEach(function(index) { if (result.counts[index] !== undefined) { result.counts[index]++; } });
            } else if (type === 'rating' && result.counts[vote - 1] !== undefined) {
                result.counts[vote - 1]++;
                sum += vote;
            } else if (type === 'freeText') {
                result.texts.push(vote);
            }
        });

        if (type === 'rating' && result.voters) {
            result.average = sum / result.voters;
        }

        return result;

    }

    /**
     * I decide a quiz from its votes (normalized choices, one per voter): { index, reason, correct }.
     * multipleChoice: index is the decided answer, reason one of "majority", "tieDefault",
     * "tieFirst", "noneDefault", "noneFirst", or "empty" (no answers, index null). The other types:
     * index null, reason "answered" or "none". correct: for multipleChoice whether the decided answer
     * is correct, for multiSelect whether at least half the votes were exactly right (none: false),
     * null where the quiz marks nothing correct, and for the other types.
     * @method decide
     * @param {Object} attrs
     * @param {Array} votes
     * @return {Object}
     */
    function decide(attrs, votes) {

        var type     = questionType(attrs),
            answers  = answersOf(attrs),
            counted  = tally(attrs, votes),
            fallback = defaultIndex(attrs),
            given    = (votes || []).filter(function(vote) { return vote !== null && vote !== undefined; });

        if (type === 'multipleChoice') {

            if (!answers.length) {
                return { index: null, reason: 'empty', correct: null };
            }

            var index, reason;

            if (!counted.voters) {
                index  = (fallback >= 0) ? fallback : 0;
                reason = (fallback >= 0) ? 'noneDefault' : 'noneFirst';
            } else {
                var most = Math.max.apply(null, counted.counts),
                    tied = [];
                counted.counts.forEach(function(count, i) { if (count === most) { tied.push(i); } });
                if (tied.length === 1) {
                    index  = tied[0];
                    reason = 'majority';
                } else {
                    index  = (fallback >= 0) ? fallback : tied[0];
                    reason = (fallback >= 0) ? 'tieDefault' : 'tieFirst';
                }
            }

            return { index: index, reason: reason, correct: correctOf(attrs, index) };

        }

        var result = { index: null, reason: given.length ? 'answered' : 'none', correct: null };

        if (type === 'multiSelect' && correctOf(attrs, []) !== null) {
            var right = given.filter(function(vote) { return correctOf(attrs, vote) === true; }).length;
            result.correct = given.length > 0 && right * 2 >= given.length;
        }

        return result;

    }

    // The action of a stored holder (an answer, onAnswered) in the new model.
    function actionOfHolder(holder) {
        holder = isObject(holder) ? holder : {};
        var action = (ACTIONS.indexOf(holder.action) >= 0) ? holder.action : '';
        return {
            action:     action,
            target:     (action === 'openUrl' || action === 'jumpToTime' || action === 'jumpToHypervideo') ? holder.actionTarget : undefined,
            targetTime: (action === 'jumpToHypervideo') ? holder.actionTargetTime : undefined,
            feedback:   (typeof holder.feedback === 'string') ? holder.feedback : ''
        };
    }

    // The action a legacy outcome object meant, answered at time (seconds of the video).
    function actionOfOutcome(outcome, time) {

        if (!isObject(outcome)) {
            return { action: 'pause', target: undefined, targetTime: undefined, feedback: '' };
        }

        var feedback = (typeof outcome.showText === 'string') ? outcome.showText : '',
            forward  = parseFloat(outcome.jumpForward),
            backward = parseFloat(outcome.jumpBackward),
            jump     = (forward > 0) ? forward : ((backward > 0) ? -backward : 0);

        if (jump) {
            return { action: 'jumpToTime', target: Math.max(0, Math.round(((parseFloat(time) || 0) + jump) * 1000) / 1000), targetTime: undefined, feedback: feedback };
        }

        return { action: (outcome.resumePlayback === false) ? 'pause' : '', target: undefined, targetTime: undefined, feedback: feedback };

    }

    /**
     * I return what happens after a decision (decide()): { action, target, targetTime, feedback }.
     * time is when the quiz was answered (seconds of the video): legacy jumps are relative to it.
     * @method actionOf
     * @param {Object} attrs
     * @param {Object} decision
     * @param {Number} [time]
     * @return {Object}
     */
    function actionOf(attrs, decision, time) {

        var type    = questionType(attrs),
            answers = answersOf(attrs);

        decision = decision || {};

        if (!isLegacy(attrs)) {
            if (type === 'multipleChoice') {
                return actionOfHolder(answers[decision.index]);
            }
            return actionOfHolder(attrs.onAnswered);
        }

        if (type === 'multipleChoice' || type === 'multiSelect') {
            if (decision.index === null && type === 'multipleChoice') {
                return actionOfOutcome(null, time);
            }
            return actionOfOutcome(decision.correct === true ? attrs.onCorrectAnswer : attrs.onWrongAnswer, time);
        }

        return actionOfOutcome(attrs.onAnswered, time);

    }

    // A holder's stored fields for an action.
    function storedAction(action) {
        var stored = { action: action.action };
        if (action.target !== undefined && action.target !== null && action.target !== '') { stored.actionTarget = action.target; }
        if (action.targetTime !== undefined && action.targetTime !== null && action.targetTime !== '') { stored.actionTargetTime = action.targetTime; }
        if (action.feedback) { stored.feedback = action.feedback; }
        return stored;
    }

    function withAction(holder, action) {
        var out = isObject(holder) ? clone(holder) : {};
        ['showText', 'resumePlayback', 'jumpForward', 'jumpBackward'].concat(ACTION_KEYS).forEach(function(key) { delete out[key]; });
        var stored = storedAction(action);
        Object.keys(stored).forEach(function(key) { out[key] = stored[key]; });
        return out;
    }

    /**
     * I return the attributes with the legacy outcomes made into actions, as the editor saves them
     * after its first change: multipleChoice gives every answer the outcome its correct flag chose,
     * multiSelect and the other types get it as onAnswered (multiSelect the correct answer's: its
     * wrong branch goes), jumps become jumpToTime at start ± the seconds, showText becomes feedback.
     * Attributes that are not legacy come back unchanged (a copy).
     * @method fromLegacy
     * @param {Object} attrs
     * @param {Number} start the quiz's start (seconds of the video), which legacy jumps are relative to
     * @return {Object}
     */
    function fromLegacy(attrs, start) {

        var out = clone(attrs) || {};

        if (!isLegacy(attrs)) { return out; }

        var type = questionType(attrs);

        if (type === 'multipleChoice') {
            out.answers = (Array.isArray(out.answers) ? out.answers : []).map(function(answer) {
                if (!isObject(answer)) { return answer; }
                return withAction(answer, actionOfOutcome(answer.correct === true ? attrs.onCorrectAnswer : attrs.onWrongAnswer, start));
            });
            delete out.onAnswered;
        } else if (type === 'multiSelect') {
            out.onAnswered = withAction({}, actionOfOutcome(attrs.onCorrectAnswer, start));
        } else {
            out.onAnswered = withAction(attrs.onAnswered, actionOfOutcome(attrs.onAnswered, start));
        }

        delete out.onCorrectAnswer;
        delete out.onWrongAnswer;

        return out;

    }

    /**
     * I return the attributes changed to another question type, without what the other types keep:
     * multipleChoice has answers with actions and no onAnswered; multiSelect answers without actions
     * and an onAnswered; freeText and rating no answers, an onAnswered, rating its ratingScale.
     * labels: { answer1, answer2 } for the answers a choice type gets when it has none.
     * @method changeType
     * @param {Object} attrs
     * @param {String} type
     * @param {Object} [labels]
     * @return {Object}
     */
    function changeType(attrs, type, labels) {

        var out = clone(attrs) || {};

        type = (TYPES.indexOf(type) >= 0) ? type : 'multipleChoice';
        labels = labels || {};
        out.questionType = type;

        delete out.onCorrectAnswer;
        delete out.onWrongAnswer;

        if (type === 'multipleChoice' || type === 'multiSelect') {
            if (!Array.isArray(out.answers) || !out.answers.length) {
                out.answers = [
                    { text: labels.answer1 || '', correct: false },
                    { text: labels.answer2 || '', correct: true }
                ];
            }
            out.answers = out.answers.filter(isObject).map(function(answer) {
                if (type === 'multipleChoice') {
                    if (!has(answer, 'action')) { answer.action = ''; }
                } else {
                    ACTION_KEYS.concat(['default']).forEach(function(key) { delete answer[key]; });
                }
                return answer;
            });
            delete out.ratingScale;
        } else {
            delete out.answers;
            if (type === 'rating') {
                out.ratingScale = ratingScale(out);
            } else {
                delete out.ratingScale;
            }
        }

        if (type === 'multipleChoice') {
            delete out.onAnswered;
        } else if (!isObject(out.onAnswered) || !has(out.onAnswered, 'action')) {
            out.onAnswered = withAction(out.onAnswered, { action: '' });
        }

        return out;

    }

    /**
     * I return the attributes of a new quiz: a multipleChoice question with three answers, the second
     * one correct, each continuing playback. labels: { question, answer1, answer2, answer3 }.
     * @method newAttributes
     * @param {Object} [labels]
     * @return {Object}
     */
    function newAttributes(labels) {
        labels = labels || {};
        return {
            questionType: 'multipleChoice',
            question:     labels.question || '',
            answers: [
                { text: labels.answer1 || '', correct: false, action: '' },
                { text: labels.answer2 || '', correct: true,  action: '' },
                { text: labels.answer3 || '', correct: false, action: '' }
            ]
        };
    }

    /**
     * I return the key a quiz item is known by between the player and its phones: its creator's id
     * and its created (milliseconds), which are unique together.
     * @method itemKey
     * @param {Object} data an overlay's or annotation's data
     * @return {String}
     */
    function itemKey(data) {
        return String(isObject(data) ? data.creatorId : '') + '/' + String(isObject(data) ? data.created : '');
    }


    /* ------------------------------------------------------------------ */
    /*  Results                                                           */
    /* ------------------------------------------------------------------ */

    // What a list of results (the Quiz Results view) says about a question:
    //   open      not decided yet
    //   right     the first decision was right
    //   retried   the first was not, a later one was (the part was played again)
    //   wrong     decided, and not right yet
    //   answered  decided, with no right or wrong to tell (free text, rating, no answer marked correct)
    var RESULT_STATES = ['open', 'right', 'retried', 'wrong', 'answered'];

    /**
     * I say whether a quiz has a right answer to tell: a multipleChoice or multiSelect quiz with an
     * answer marked as correct. Only such questions count for a score.
     * @method gradable
     * @param {Object} attrs
     * @return {Boolean}
     */
    function gradable(attrs) {
        return isChoice(attrs) && answersOf(attrs).some(function(answer) { return answer.correct === true; });
    }

    /**
     * I return what a list of questions needs of a quiz item, without its answers:
     * { key, start, end, question, questionType, gradable }. A paired phone gets these for the quiz
     * overlays, which are not in its copy of the hypervideo.
     * @method digest
     * @param {Object} data an overlay's or annotation's data
     * @return {Object}
     */
    function digest(data) {
        var attrs = (isObject(data) && isObject(data.attributes)) ? data.attributes : {};
        return {
            key:          itemKey(data),
            start:        (isObject(data) && isFinite(data.start)) ? Number(data.start) : 0,
            end:          (isObject(data) && isFinite(data.end)) ? Number(data.end) : 0,
            question:     (typeof attrs.question === 'string') ? attrs.question : '',
            questionType: questionType(attrs),
            gradable:     gradable(attrs)
        };
    }

    /**
     * I read a question's record as it was kept ({ first, solved, tries }), or null when it is none:
     * records come back from the browser's storage, where anything may have been written.
     * @method readRecord
     * @param {*} value
     * @return {Object|null}
     */
    function readRecord(value) {
        if (!isObject(value) || typeof value.tries !== 'number' || !isFinite(value.tries) || value.tries < 1) { return null; }
        return {
            first:  (value.first === true) ? true : (value.first === false ? false : null),
            solved: value.solved === true,
            tries:  Math.floor(value.tries)
        };
    }

    /**
     * I add a decision to a question's record and return the new record: { first, solved, tries }.
     * first is whether the first decision was right (null: nothing right or wrong to tell), solved
     * whether any was, tries how often the question was decided. correct is a decision's "correct"
     * (decide()). The record given is not changed.
     * @method recordResult
     * @param {Object|null} record the record so far
     * @param {Boolean|null} correct
     * @return {Object}
     */
    function recordResult(record, correct) {

        var known = readRecord(record);

        correct = (correct === true) ? true : (correct === false ? false : null);

        if (!known) {
            return { first: correct, solved: correct === true, tries: 1 };
        }

        return { first: known.first, solved: known.solved || correct === true, tries: known.tries + 1 };

    }

    /**
     * I return the state of a question from its record: one of RESULT_STATES.
     * @method resultState
     * @param {Object|null} record
     * @return {String}
     */
    function resultState(record) {
        var known = readRecord(record);
        if (!known)               { return 'open'; }
        if (known.first === true) { return 'right'; }
        if (known.solved)         { return 'retried'; }
        return (known.first === false) ? 'wrong' : 'answered';
    }

    /**
     * I return the states of the questions that have a record: { key: state }.
     * @method resultStates
     * @param {Object} records { key: record }
     * @return {Object}
     */
    function resultStates(records) {
        var states = {};
        if (isObject(records)) {
            Object.keys(records).forEach(function(key) {
                var state = resultState(records[key]);
                if (state !== 'open') { states[key] = state; }
            });
        }
        return states;
    }

    /**
     * I count a list of questions by their states: { total, gradable, right, retried, wrong,
     * answered, open, done }. gradable are the questions with a right answer to tell, of which
     * right were right at the first try; done are the questions that are no longer open.
     * @method score
     * @param {Array} questions digests ({ key, gradable })
     * @param {Object} states { key: state }
     * @return {Object}
     */
    function score(questions, states) {

        var result = { total: 0, gradable: 0, right: 0, retried: 0, wrong: 0, answered: 0, open: 0, done: 0 };

        states = isObject(states) ? states : {};

        (Array.isArray(questions) ? questions : []).forEach(function(question) {
            if (!isObject(question)) { return; }
            var state = has(states, question.key) ? states[question.key] : 'open';
            if (RESULT_STATES.indexOf(state) < 0) { state = 'open'; }
            result.total++;
            result[state]++;
            if (question.gradable) { result.gradable++; }
            if (state !== 'open')  { result.done++; }
        });

        return result;

    }


    return {

        TYPES:           TYPES,
        ACTIONS:         ACTIONS,
        MAX_TEXT:        MAX_TEXT,
        RESULT_STATES:   RESULT_STATES,

        questionType:    questionType,
        isChoice:        isChoice,
        ratingScale:     ratingScale,
        isLegacy:        isLegacy,
        defaultIndex:    defaultIndex,
        normalizeChoice: normalizeChoice,
        correctOf:       correctOf,
        tally:           tally,
        decide:          decide,
        actionOf:        actionOf,
        fromLegacy:      fromLegacy,
        changeType:      changeType,
        newAttributes:   newAttributes,
        itemKey:         itemKey,

        gradable:        gradable,
        digest:          digest,
        readRecord:      readRecord,
        recordResult:    recordResult,
        resultState:     resultState,
        resultStates:    resultStates,
        score:           score

    };

});
