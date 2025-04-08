import { Plugin, MarkdownView, PluginSettingTab, Setting, App } from 'obsidian';
import { ViewPlugin } from '@codemirror/view';
import { Extension } from '@codemirror/state';

interface CheckboxSortSettings {
	enableGlobalCheckboxSort: boolean;
	debugMode: boolean;
}

const DEFAULT_SETTINGS: CheckboxSortSettings = {
	enableGlobalCheckboxSort: true, // Default to enabled
	debugMode: false // Default disabled
}

function checkboxClickHandlerExtension(onClick: (lineNumber: number) => void): Extension {
    return ViewPlugin.define(view => {
        const handleClick = (event: MouseEvent) => {
             const target = event.target as HTMLElement;
             if (target instanceof HTMLInputElement &&
                 target.type === 'checkbox' &&
                 target.classList.contains('task-list-item-checkbox'))
             {
                 const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
                 if (pos !== null) {
                     const line = view.state.doc.lineAt(pos);
                     const lineNumber = line.number - 1; // 0-based
                     try {
                        onClick(lineNumber);
                     } catch (e) {
                        console.error("Error executing onClick callback:", e);
                     }
                 }
             }
        };
        view.dom.addEventListener('click', handleClick);
        return {
            destroy() {
                view.dom.removeEventListener('click', handleClick);
            }
        };
    });
}


export default class ObsidianCheckboxSort extends Plugin {
    settings!: CheckboxSortSettings;

    debugLog(message: any, ...optionalParams: any[]) {
        if (this.settings.debugMode) {
            console.debug(message, ...optionalParams);
        }
    }

    async onload() {
        // Load settings
        await this.loadSettings();

        // Add the settings tab
        this.addSettingTab(new CheckboxSortSettingTab(this.app, this));

        // Register the editor extension (remains the same)
        const extension = checkboxClickHandlerExtension((lineNumber) => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            // Pass the whole view object now to access file context
            if (view && view.file) { // Ensure view and file exist
                this.sortCheckboxesAroundClick(view, lineNumber);
            } else {
                console.error("CALLBACK: Could not get MarkdownView to process checkbox click.");
            }
        });
        try {
            this.registerEditorExtension(extension);
            this.debugLog("Checkbox Sort editor extension registered successfully.");
        } catch (e) {
            console.error("Failed to register Checkbox Sort editor extension:", e);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // --- sortCheckboxesAroundClick ---
    async sortCheckboxesAroundClick(view: MarkdownView, clickedLineNumber: number) {
        // Get editor and file from view
        const editor = view.editor;
        const file = view.file; // Needed for frontmatter check
        
        // --- Determine Effective Setting (Global -> Frontmatter -> List Marker) ---
        let fileLevelSortingEnabled = this.settings!.enableGlobalCheckboxSort;
        let settingSource = "Global Default";

        // Hierarchy: List Marker > Frontmatter > Global Setting
        // File may not be available in detached views - crucial for frontmatter check
        // getFileCache() is null until file is persisted to disk
        if (file) {
            // Critical: metadataCache only contains persisted files - new/unsaved files
            // won't have frontmatter available until first save
            const fileCache = this.app.metadataCache.getFileCache(file);
            const frontmatter = fileCache?.frontmatter;
            if (frontmatter && frontmatter['checkbox-sort'] !== undefined && typeof frontmatter['checkbox-sort'] === 'boolean') {
                 fileLevelSortingEnabled = frontmatter['checkbox-sort'];
                 settingSource = "File Frontmatter";
            }
        }
        this.debugLog(`Starting effective setting based on Global/Frontmatter: ${fileLevelSortingEnabled} (Source: ${settingSource})`);

        // --- Now, check for List Marker Override ---
        // Need to find blockStartLine *before* this check
        const totalLines = editor.lineCount(); // Ensure totalLines is available
        let effectiveSortingEnabled = fileLevelSortingEnabled; // Start with file level result

        // Need clickedLineText, currentIndent, listItemRegex before finding blockStartLine
        const clickedLineText = editor.getLine(clickedLineNumber);
        const currentIndent = this.getIndentationLevel(clickedLineText);
        const listItemRegex = /^\s*[-*+]\s+/;

        // Find contiguous list items at same indent level - these form a sortable group
        // Nested lists (higher indent) are considered part of parent item's subtree
        let blockStartLine = clickedLineNumber;
        for (let i = clickedLineNumber - 1; i >= 0; i--) { // Scan Up
            const line = editor.getLine(i); const indent = this.getIndentationLevel(line);
            if (!listItemRegex.test(line)) break;
            if (indent === currentIndent) { blockStartLine = i; } else if (indent < currentIndent) { break; }
        }
        this.debugLog(`Peer block starts at line: ${blockStartLine}. Scanning for list marker...`);


        // 2. Scan for List Marker Override (Scan upwards from clicked line until marker or top)
        const enableMarker = '%%checkbox-sort: true%%'; // Hardcoded for now
        const disableMarker = '%%checkbox-sort: false%%'; // Hardcoded for now
        let listMarkerFound: boolean | null = null;
        let foundMarkerLine = -1;

        this.debugLog(`Scanning upwards from line ${clickedLineNumber - 1} for list marker...`);
        for (let scanLineNum = clickedLineNumber - 1; scanLineNum >= 0; scanLineNum--) {
            const lineContent = editor.getLine(scanLineNum).trim();
            
            // Check for specific markers
            if (lineContent.includes(enableMarker)) {
                listMarkerFound = true;
                settingSource = "List Marker (Enable)";
                foundMarkerLine = scanLineNum;
                this.debugLog(`Found enable marker at line ${scanLineNum}`);
                break; // Closest marker wins
            }
            if (lineContent.includes(disableMarker)) {
                listMarkerFound = false;
                settingSource = "List Marker (Disable)";
                foundMarkerLine = scanLineNum;
                this.debugLog(`Found disable marker at line ${scanLineNum}`);
                break; // Closest marker wins
            }

            // Stop scanning if we hit non-list content - markers only apply to subsequent list items
            // in the same list structure. A paragraph/heading breaks the list context.
            if (!listItemRegex.test(lineContent)) {
                this.debugLog(`Scan hit non-list item line at ${scanLineNum}, stopping marker search.`);
                break; // Stop scanning upwards
            }
        }

        // 3. Apply List Marker Override if found
        if (listMarkerFound !== null) {
            effectiveSortingEnabled = listMarkerFound;
            this.debugLog(`List marker found at line ${foundMarkerLine}. Effective sorting overridden to: ${effectiveSortingEnabled} (Source: ${settingSource})`);
        } else {
            this.debugLog(`No list marker found above line ${clickedLineNumber}. Effective sorting remains: ${effectiveSortingEnabled} (Source: ${settingSource})`);
        }


        // --- Final Effective Setting Check ---
        if (!effectiveSortingEnabled) {
            this.debugLog(`Checkbox sorting disabled by ${settingSource} setting. Aborting sort logic.`);
            // Perform basic tick/untick in place? Let's skip for now.
            return;
        }
        // --- End Effective Setting Check ---


        this.debugLog(`sortCheckboxesAroundClick: Proceeding with sort for line: ${clickedLineNumber}`);
        try {
            const clickedLineText = editor.getLine(clickedLineNumber);
            const currentIndent = this.getIndentationLevel(clickedLineText);
            const listItemRegex = /^\s*[-*+]\s+/;

            // --- We already have totalLines, clickedLineText, currentIndent, listItemRegex ---
            // --- Need remaining variables for the logic block ---
            const tickedCheckboxRegex = /^\s*[-*+]\s+\[x\]/;

            const isCurrentlyTicked = tickedCheckboxRegex.test(clickedLineText);
            const isNowTicked = !isCurrentlyTicked;

            if (!listItemRegex.test(clickedLineText)) {
                console.warn(`Line ${clickedLineNumber} is not a list item. Aborting action.`);
                return;
            }

            this.debugLog(`Click detected on line ${clickedLineNumber}. Current state: ${isCurrentlyTicked ? 'Ticked' : 'Unticked'}. New state: ${isNowTicked ? 'Ticked' : 'Unticked'}. Indent: ${currentIndent}`);


            // --- Step 1: Find Peer Block Boundaries (Peers at same indent) ---
            let blockStartLine = clickedLineNumber;
            for (let i = clickedLineNumber - 1; i >= 0; i--) { // Scan Up
                const line = editor.getLine(i);
                const indent = this.getIndentationLevel(line);
                if (!listItemRegex.test(line)) break;
                if (indent === currentIndent) {
                    blockStartLine = i;
                } else if (indent < currentIndent) {
                    break;
                }
            }

            let blockEndLine = clickedLineNumber; // This will store the line number of the last PEER
            for (let i = clickedLineNumber + 1; i < totalLines; i++) { // Scan Down
                const line = editor.getLine(i); const indent = this.getIndentationLevel(line);
                if (!listItemRegex.test(line)) break;
                if (indent === currentIndent) { blockEndLine = i; } else if (indent < currentIndent) { break; }
            }
            this.debugLog(`Peer block boundaries (inclusive): ${blockStartLine} to ${blockEndLine}`);

            // Step 2: Iterate through PEERS, collect item trees, sort into lists
            const untickedItemsData: { text: string, originalLine: number }[] = [];
            const tickedItemsData: { text: string, originalLine: number }[] = [];

            let i = blockStartLine;
            while (i <= blockEndLine) {
                const currentPeerLineText = editor.getLine(i);
                const currentPeerIndent = this.getIndentationLevel(currentPeerLineText);

                if (!listItemRegex.test(currentPeerLineText) || currentPeerIndent !== currentIndent) {
                     i++;
                     continue;
                }

                // Find the end of the tree for this peer item 'i'
                let peerTreeEndLine = i;
                 for (let j = i + 1; j < totalLines; j++) {
                     const descLineText = editor.getLine(j);
                     const descIndent = this.getIndentationLevel(descLineText);
                     // Tree ends if not list item or indent is not greater than the PEER's indent
                     if (!listItemRegex.test(descLineText) || descIndent <= currentPeerIndent) { break; }
                     peerTreeEndLine = j;
                 }
                this.debugLog(`Peer at ${i}: Tree detected from line ${i} to ${peerTreeEndLine}`);

                // Process each peer's entire subtree (nested items) as a single unit
                // to preserve hierarchical relationships during sorting
                let peerTreeText = "";
                for (let k = i; k <= peerTreeEndLine; k++) {
                    // Add newline unless it's the absolute last line of the file
                    peerTreeText += editor.getLine(k) + (k === totalLines - 1 ? "" : "\n");
                }

                // Use inverse of current state for sorting because the click hasn't
                // been processed by Obsidian yet - we're intercepting the raw event
                let isPeerTickedForSorting: boolean;
                // Handle clicked item first - its state is inverted from current rendering
                // because we're intercepting the click before Obsidian updates it
                if (i === clickedLineNumber) {
                    isPeerTickedForSorting = isNowTicked;
                    // Modify the first line of the extracted text block to reflect the new state
                    const lines = peerTreeText.split('\n');
                    if (lines.length > 0) {
                        if (isNowTicked) lines[0] = lines[0].replace('[ ]', '[x]');
                        else lines[0] = lines[0].replace('[x]', '[ ]');
                        peerTreeText = lines.join('\n');
                        this.debugLog(`Updated text for clicked item (lines ${i}-${peerTreeEndLine}) for new state: ${isNowTicked?'Ticked':'Unticked'}`);
                    }
                } else { // Not the clicked item, use its current state
                    isPeerTickedForSorting = tickedCheckboxRegex.test(currentPeerLineText);
                }

                // Add data block to the appropriate list
                const itemData = { text: peerTreeText, originalLine: i };
                if (isPeerTickedForSorting) {
                    tickedItemsData.push(itemData);
                } else {
                    untickedItemsData.push(itemData);
                }

                // Advance loop counter past the processed tree
                i = peerTreeEndLine + 1;
            } // End of peer processing loop

            // --- Step 3: Prepare final text and replacement range ---
            const finalBlockText = untickedItemsData.map(d => d.text).join('') +
                                    tickedItemsData.map(d => d.text).join('');

            // Determine the range of the entire original block structure to delete
            // Find the actual end of the whole structure, including children of the last peer
            let overallBlockEndLine = blockEndLine; // Start with last peer line
             for(let i = blockEndLine + 1; i < totalLines; ++i) {
                 const line = editor.getLine(i);
                 const indent = this.getIndentationLevel(line);
                 // Stop if not list item or indent goes back to less than the base indent
                 if (!listItemRegex.test(line) || indent < currentIndent) break;
                 overallBlockEndLine = i;
             }
             this.debugLog(`Entire structure to replace spans ${blockStartLine} to ${overallBlockEndLine}`);

             const deleteFrom = { line: blockStartLine, ch: 0 };
             const deleteTo = (overallBlockEndLine === totalLines - 1)
                            ? { line: overallBlockEndLine, ch: editor.getLine(overallBlockEndLine).length }
                            : { line: overallBlockEndLine + 1, ch: 0 };

            // Maintain proper newline structure - don't add trailing newline if replacing up to EOF,
            // but ensure separation when inserting before existing content
            let textToInsert = finalBlockText;
              if (!textToInsert.endsWith('\n') && overallBlockEndLine < totalLines - 1) {
                 textToInsert += '\n';
              }
              if (textToInsert.endsWith('\n') && overallBlockEndLine === totalLines - 1) {
                 textToInsert = textToInsert.slice(0,-1);
              }

            // --- Step 4: Perform Transaction if needed ---
             const originalBlockText = editor.getRange(deleteFrom, deleteTo);
             if(textToInsert.trim() === originalBlockText.trim()) {
                  this.debugLog("No changes needed.");
                  return;
             }
            this.debugLog(`Replacing lines ${blockStartLine}-${overallBlockEndLine} with new sorted block.`);
            editor.transaction({ changes: [{ from: deleteFrom, to: deleteTo, text: textToInsert }] });
            this.debugLog(`Sorted checkbox block containing original line ${clickedLineNumber}.`);

        } catch(e) {
            console.error(`sortCheckboxesAroundClick: Error processing line ${clickedLineNumber}:`, e);
        }
    }

    // --- getIndentationLevel --- (remains the same)
    getIndentationLevel(line: string): number {
        const match = line.match(/^\s*/);
        return match ? match[0].length : 0;
    }

    onunload() {
        // No specific setting cleanup needed here
    }
}

class CheckboxSortSettingTab extends PluginSettingTab {
	plugin: ObsidianCheckboxSort;

	constructor(app: App, plugin: ObsidianCheckboxSort) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Checkbox Sorter Settings'});

		new Setting(containerEl)
			.setName('Enable debug mode')
			.setDesc('Show detailed debugging information in console')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugMode)
				.onChange(async (value) => {
					this.plugin.settings.debugMode = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable Checkbox Sorting Globally')
			.setDesc('If enabled, clicking checkboxes will sort them within their peer group (unticked first, then ticked). This can be overridden by file frontmatter or list markers later.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableGlobalCheckboxSort)
				.onChange(async (value) => {
					this.plugin.debugLog('Global sort setting changed:', value);
					this.plugin.settings.enableGlobalCheckboxSort = value;
					await this.plugin.saveSettings();
				}));
	}
}
