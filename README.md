# Obsidian Checkbox Sorter 🔄

Automatically moves completed checkboxes to the bottom of their list group when toggled. Preserves nested list structure while sorting.

## Basic Example ▶️
**Click any checkbox** to toggle it and watch it sink to the bottom of its peer group:

```markdown
- [ ] Buy milk  <-- Click this checkbox
- [ ] Get gas
- [x] Bread     (already completed)
```

**Becomes after clicking:**
```markdown
- [ ] Get gas    ← Unticked stays on top
- [x] Buy milk   ← Newly completed moves here
- [x] Bread      ← Existing completed items
```

## Features ✨
- **Three-level configuration** (global/file/list-marker)
- **Nested list support** - child items stay with parents
- **Smart grouping** - only affects peers at same indentation
- **Multi-list handling** - works with multiple lists in one file

## Installation ⬇️
1. Open Obsidian → Settings → Community plugins
2. Click "Browse" and search "Checkbox Sorter"
3. Install and enable plugin
4. (Optional) Configure default behavior in plugin settings

## Usage 🛠️
### Configuration Hierarchy (Lowest to Highest):
1. Global Setting
2. File Frontmatter (`checkbox-sort: [true|false]`)
3. List Marker (`%%checkbox-sort: [true|false]%%`)

#### Global Setting (enabled by default):  
```markdown
- [ ] Buy milk   <-- Click toggles and sorts
- [ ] Get gas
```

#### File Frontmatter (add to YAML frontmatter):  
```yaml
---
checkbox-sort: false  # Disable for this file
---
```

#### List Marker Override:  
```markdown
%%checkbox-sort: false%%  <-- Disables sorting for next list
- [ ] Task 1
- [ ] Task 2

%%checkbox-sort: true%%  <-- Enables sorting for this list
- [ ] Task A
- [ ] Task B
```

### Nested List Example:  
```markdown
- [ ] Parent 1
  - [ ] Child 1
  - [ ] Child 2  <-- Click this checkbox
  - [ ] Child 3
- [ ] Parent 2
```

**Becomes after clicking:**
```markdown
- [ ] Parent 1
  - [ ] Child 1
  - [ ] Child 3
  - [x] Child 2  <-- Completed moves here
- [ ] Parent 2
```

## How It Works 🔧
1. Clicking a checkbox:
   - Toggles task state
   - Finds all peer items at same indentation level
   - Groups unticked items first (sorted as-is), then ticked items
   - Preserves nested list structure under each item

## Troubleshooting ⚠️
**Sorting not working?**  
→ Verify no conflicting list markers exist above  
→ Check frontmatter isn't overriding global settings  
→ Ensure marker comments are _directly_ above list  

**New file issues?**  
→ Save file first for frontmatter settings to take effect
