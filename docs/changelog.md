# Changelog

## 1.2.0

### Highlight
- **Excel import and export**: you can now bring your data in from Excel files (.xlsx), choose which sheet to use, and export back to Excel with the changes you made.

### New features
- **Multi-row selection** in the Data tab, with the ability to choose which rows are enabled for rendering.
- **Save to the open file**: modified data can now be saved back to the spreadsheet/CSV file that is already open.
- **Open render results folder** directly from the render results table.

### Improvements
- Render queue management: queue templates instead of rendering directly, which allows you to send them to Media Encoder. Improved output actions interface.
- Redesigned Data tab: sticky headers, smarter column widths, refined borders, margins and padding.
- Cleaner, better formatted render results table.
- Folder selection dialogs now show the modern file explorer on Windows.
- New default file path pattern for dependent templates.
- Polished the layout of tooltips, the details view and warnings.
- CSV export now includes a byte order mark (BOM) so other apps detect the encoding correctly.

### Fixes
- Fixed the light OS theme/appearance so that buttons no longer render white.
- Fixed stale names in the One-to-Many (OtM) render mode.
- Fixed a problem when resetting settings.
- Minor fixes to the menu.

### Documentation
- Updated Getting Started, Data tab and Output tab guides, with refreshed screenshots. Added a new tutorial.