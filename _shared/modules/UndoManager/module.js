/**
 * @module Shared
 */

/**
 * I am the UndoManager. I provide undo/redo functionality for edit operations
 * using the command pattern. Each undoable action is wrapped in a command object
 * containing both undo() and redo() functions.
 *
 * @class UndoManager
 * @static
 */

FrameTrail.defineModule('UndoManager', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var undoStack = [],
        redoStack = [],
        maxHistory = 10,
        isUndoRedoInProgress = false;

    // Map command categories to editMode values
    var categoryToEditMode = {
        'overlays': 'overlays',
        'annotations': 'annotations',
        'codeSnippets': 'codesnippets',
        'layout': 'layout'
    };


    /**
     * I switch to the appropriate edit mode for a command's category.
     * This ensures the user can see the change being made.
     *
     * @method switchToCategory
     * @param {String} category - The command category
     * @private
     */
    function switchToCategory(category) {
        if (!category) return;
        
        var editMode = categoryToEditMode[category];
        if (editMode && FrameTrail.getState('editMode') !== editMode) {
            FrameTrail.changeState('editMode', editMode);
        }
    }


    /**
     * I execute a command and add it to the undo stack.
     * This is the main entry point for registering undoable actions.
     *
     * @method execute
     * @param {Object} command - Command object with undo, redo functions and description
     * @param {Function} command.undo - Function to reverse the action
     * @param {Function} command.redo - Function to apply/reapply the action
     * @param {String} command.description - Human-readable description of the action
     * @param {String} [command.category] - Category of the action (overlays, annotations, etc.)
     */
    function execute(command) {
        if (isUndoRedoInProgress) {
            // Don't record commands triggered by undo/redo operations
            return;
        }

        // Execute the action
        command.redo();

        // Add to undo stack
        undoStack.push(command);

        // Clear redo stack when new action is performed
        redoStack = [];

        // Limit stack size
        if (undoStack.length > maxHistory) {
            undoStack.shift();
        }

        updateUI();
    }


    /**
     * I register a command without executing it.
     * Use this when the action has already been performed and you just
     * want to make it undoable.
     *
     * @method register
     * @param {Object} command - Command object with undo, redo functions and description
     */
    function register(command) {
        if (isUndoRedoInProgress) {
            // Don't record commands triggered by undo/redo operations
            return;
        }

        // Add to undo stack without executing
        undoStack.push(command);

        // Clear redo stack when new action is performed
        redoStack = [];

        // Limit stack size
        if (undoStack.length > maxHistory) {
            undoStack.shift();
        }

        updateUI();
    }


    /**
     * I undo the last action.
     *
     * @method undo
     * @return {Boolean} True if an action was undone, false if stack was empty
     */
    function undo() {
        if (undoStack.length === 0) {
            return false;
        }

        var command = undoStack.pop();
        
        // Switch to the appropriate view first
        switchToCategory(command.category);

        isUndoRedoInProgress = true;

        try {
            command.undo();
            redoStack.push(command);
        } catch (e) {
            console.error('UndoManager: Error during undo:', e);
        }

        isUndoRedoInProgress = false;

        updateUI();

        return true;
    }


    /**
     * I redo the last undone action.
     *
     * @method redo
     * @return {Boolean} True if an action was redone, false if stack was empty
     */
    function redo() {
        if (redoStack.length === 0) {
            return false;
        }

        var command = redoStack.pop();
        
        // Switch to the appropriate view first
        switchToCategory(command.category);

        isUndoRedoInProgress = true;

        try {
            command.redo();
            undoStack.push(command);
        } catch (e) {
            console.error('UndoManager: Error during redo:', e);
        }

        isUndoRedoInProgress = false;

        updateUI();

        return true;
    }


    /**
     * I check if there are actions that can be undone.
     *
     * @method canUndo
     * @return {Boolean}
     */
    function canUndo() {
        return undoStack.length > 0;
    }


    /**
     * I check if there are actions that can be redone.
     *
     * @method canRedo
     * @return {Boolean}
     */
    function canRedo() {
        return redoStack.length > 0;
    }


    /**
     * I return the description of the next action to undo.
     *
     * @method getUndoDescription
     * @return {String|null} Description or null if stack is empty
     */
    function getUndoDescription() {
        if (undoStack.length === 0) {
            return null;
        }
        return undoStack[undoStack.length - 1].description || labels['GenericUndo'] || 'Undo';
    }


    /**
     * I return the description of the next action to redo.
     *
     * @method getRedoDescription
     * @return {String|null} Description or null if stack is empty
     */
    function getRedoDescription() {
        if (redoStack.length === 0) {
            return null;
        }
        return redoStack[redoStack.length - 1].description || labels['GenericRedo'] || 'Redo';
    }


    /**
     * I clear both undo and redo stacks.
     * Call this when switching hypervideos or when the context changes.
     *
     * @method clear
     */
    function clear() {
        undoStack = [];
        redoStack = [];
        updateUI();
    }


    /**
     * I return the current size of the undo stack.
     *
     * @method getUndoStackSize
     * @return {Number}
     */
    function getUndoStackSize() {
        return undoStack.length;
    }


    /**
     * I return the current size of the redo stack.
     *
     * @method getRedoStackSize
     * @return {Number}
     */
    function getRedoStackSize() {
        return redoStack.length;
    }


    /**
     * I update the UI to reflect the current undo/redo state.
     * This triggers a state change that UI components can listen to.
     *
     * @method updateUI
     * @private
     */
    function updateUI() {
        // Trigger a custom event that the Sidebar can listen to
        FrameTrail.triggerEvent('undoStateChanged', {
            canUndo: canUndo(),
            canRedo: canRedo(),
            undoDescription: getUndoDescription(),
            redoDescription: getRedoDescription()
        });
    }


    /**
     * I set the maximum history size.
     *
     * @method setMaxHistory
     * @param {Number} size - Maximum number of actions to keep in history
     */
    function setMaxHistory(size) {
        maxHistory = size;
        // Trim existing stacks if necessary
        while (undoStack.length > maxHistory) {
            undoStack.shift();
        }
    }


    return {
        execute: execute,
        register: register,
        undo: undo,
        redo: redo,
        canUndo: canUndo,
        canRedo: canRedo,
        getUndoDescription: getUndoDescription,
        getRedoDescription: getRedoDescription,
        clear: clear,
        getUndoStackSize: getUndoStackSize,
        getRedoStackSize: getRedoStackSize,
        setMaxHistory: setMaxHistory
    };

});
