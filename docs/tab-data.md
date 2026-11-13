The `Data` tab is where you will edit the versions of your template. Each property in your Essential Graphics template becomes a column in the `Data` tab. Each row then becomes a variation of your render.

## The Basics

![Screenshot of the Data tab menu](assets/data-hl-menu.png)

### What Is a Row? (Green)
Each row is a version of your template. You can add, remove, and edit rows as needed. You can also import rows from an Excel or CSV file or a Google spreadsheet. EasyBatch supports the same property types as Essential Graphics. In the simplest render setup, each row becomes a separate render.

### Top Bar Menus (Yellow)
!!! tip "Use Shortcuts"
    All menu actions display their equivalent shortcut on the right. Shortcuts work only while the extension is focused.

#### File
![Screenshot of the File menu](assets/data-hl-menu-file.png)

Use **Import File** to choose a CSV or Excel file (`.xlsx`, `.xls`, or `.xlsm`), or **Import Google Sheets** to sign in and choose a Google spreadsheet in your browser. Select a sheet, if applicable, then review the automatic property-to-column matches and adjust them before confirming. Unmapped properties keep their existing values where possible.

After an import, **Re-import** (Alt/Option+R) reloads the active source with its saved mapping, and **Save Updates** (Alt/Option+S) writes the mapped values back to that source. These actions use the last source imported into the selected template. Saving preserves other columns and does not overwrite Excel or Google Sheets formula cells or CSV cells starting with `=`. Existing rows beyond the template's current row count are not deleted. If a mapped header is duplicated or multiple properties map to the same header, saving is refused to avoid an ambiguous update.

Google access is limited to files you choose for EasyBatch; shared spreadsheets can be opened if your Google account has access. Saving updates requires edit permission. Authorization is held only in memory, so you must authorize again after closing the extension or when the access token expires. Updates are not synchronized automatically. Avoid editing the spreadsheet concurrently with a save: another editor can change cells between EasyBatch reading and updating them.

**Export File** is always available for the selected template and creates a separate CSV or `.xlsx` file. Choose the export method before selecting the destination. For Excel, the sheet name defaults to the template name and can be edited; it must meet Excel's sheet-naming rules. Exporting does not change the active import source. Exporting a sample is a useful way to see the expected column names and value formats.

The **Recent Sources** section lists up to ten successfully imported sources across templates and projects on this computer. Select one to reopen the mapping dialog. The list stores local file paths or spreadsheet links and names in the extension's local browser storage; it does not store Google tokens there. The active source and its mapping are stored with the project. Local files normally use a path relative to the project folder; files imported before a project is saved use an absolute path.

#### Edit
![Screenshot of the Edit menu](assets/data-hl-menu-edit.png)

These are the editing options for the selected row.

- **Add Row After/Before:** Adds a row before or after the current row by duplicating its data. This is useful when you want to modify only a few properties.
- **Delete:** Deletes the currently selected row. The extension does not have an undo function yet.
- **Preview:** Previews the selected row's data in the selected template. This operation loads a composition called `TemplatePreview`, which contains a layer that references your template. The extension then replaces the Essential Properties to match the row.
- **Copy from Preview:** If you are editing the template in After Effects' Properties panel while the `TemplatePreview` composition is open, this copies the properties from the preview to the row. This is useful when you are editing properties that require precision, since the extension preview does not update as frequently.
- **Render Row:** Renders the current row. Configure the render before using this option; see [Tab: Output](tab-output.md).

#### View

![Screenshot of the View menu](assets/data-hl-menu-view.png)

- **Show as Table:** Displays the default view.
- **Show in Detail:** Displays only the current row and makes it easier to edit templates with many properties.
- **Previous/Next Row:** Changes the currently selected row. This is useful in Detail View mode.
- **Edit View...:** Opens a dialog that allows you to hide or reorder columns and properties in the table and detail views.

### Row Options (in blue)

![Screenshot of the row options](assets/data-hl-row-opts.png)

- **Row index:** Displays the row number. You can use this number to name your renders.
- **Row menu:** Click to open the Edit menu, the same menu that opens from the top bar or when you right-click the row.
- **Preview button:** Previews your template with the row's data.

## Editing Properties

![Essential Graphics panel](assets/essential-graphics-sm.png){ width="500" }

All the properties that you see on EasyBatch start in the Essential Graphics panel. EasyBatch supports all types of properties that can be added to an Essential Graphics template.

![Screenshot of editable row properties](assets/data-hl-row-props.png)

### Text
This property is created when you drag the `Source Text` property of a text layer into the Essential Graphics panel. It supports multiple lines and special characters. You can expand the text-editing box by dragging its corner.

### Slider/Number
Created by dragging any numeric property or the `Slider` Expression Control into Essential Graphics. You can type the number or use the arrows to move up and down.

You can also drag horizontally on the value to change the number.

### Point/Two Dimension Number
Created by dragging any two-dimensional property into the Essential Graphics panel. Like the slider property, the values can be typed directly, or you can drag the `X` and `Y` values to change them quickly.

### Dropdown
Created by dragging a `Dropdown Menu Control` Expression Control into the Essential Graphics panel.

### Image/Replaceable
This is the most complex type of property. It is created by dragging an image or movie layer into the Essential Graphics panel. You can load the image for each layer manually by clicking the file icon in each cell of the column.

The extension also provides a way to load images that follow a pattern. EasyBatch allows you to use a pattern to load these files.

#### Patterns
![Screenshot of the replaceable file path pattern](assets/data-replaceable.png){ width="500" }

The `File Path Pattern` allows you to use other properties to find a file.

The pattern is made up of `Fields`. A field can be another property of your template, the row number, or a custom increment. Fields are represented by braces in the pattern. Everything inside braces is replaced if it is a valid property. The pattern is evaluated for each row, using that row's property values to resolve the file path.

To add a field, open the `Add Field` dropdown and select one. Fields in bold represent special options:

- **Base Folder/Path:** If your files are in a complex path, use a `Base Folder` field. When included in the pattern, it represents the path to the folder you select. The pattern and the base folder are relative to the project location.
- **Row Number:** The row number, starting at 0.
- **Increment:** A configurable increment. `{increment:0001}` produces `0001` for the first row and `0002` for the second row. `{increment:050}` produces `050` for the first row and `051` for the second row.
- ***Properties from your Template:*** The remaining options in the list are properties from your template.


!!! abstract "Basic Use Case Example"
    You have a template that requires a render for each country in the world. The template includes the country's flag. You already have a folder containing all the flags, and each flag is named with `FLAG` and the country name. You are already using the country name as a property in your template. You need a way to build a file path for the extension to import these files. To simplify your pattern, add a `Base Folder` field and select its value first.

    Your pattern could look like this: `{base_path}/Flags/FLAG {Country Name}.jpg`.
    If the base folder is `(Footage)` and the `Country Name` property is `United States`, the extension resolves the path to `(Footage)/Flags/FLAG United States.jpg`.

!!! note "Paths are Relative to the Project"
    The path for this pattern should be relative to your `.aep` file. This is useful if you work on a shared drive or Dropbox and collaborate with other people.

    For example, if your project is saved at `C:/Projects/WorldMap/world-map.aep` and your flags are in `C:/Projects/WorldMap/Footage/Flags`, a pattern such as `Footage/Flags/FLAG {Country Name}.jpg` can resolve to `C:/Projects/WorldMap/Footage/Flags/FLAG United States.jpg`.

    You can also go backwards manually with `..` in a relative path. For example, if your project is at `D:/ClientWork/Promo/projects/promo.aep` and the images are stored in `D:/ClientWork/Promo/assets/products`, the pattern `../assets/products/{Product Name}.png` will resolve to `D:/ClientWork/Promo/assets/products/Headphones.png`.


## Importing CSV Data
**Comma-Separated Values** is a file format that stores data in a table, similar to a spreadsheet. Matching column names to properties in your template allows EasyBatch to map them automatically. You can also choose a column manually or leave a property unmapped in the import dialog. Values must be formatted correctly, depending on the type:

- **Text:** Write the text directly in the cells. Line breaks (multiline text) may cause unexpected behavior in the extension.
- **Color:** Format colors as an RGBA array of four numbers between 0 and 1. For example, pure red is `1,0,0,1`, white is `1,1,1,1`, and gray is `0.5,0.5,0.5,1`.
- **Position:** Represent the position of 2D and 3D layers with an array of three numbers. For example, a layer in the middle of a full HD frame is `960,540,0`.
- **Scale:** Represent the scale as an array of three numbers in percentages. For example, a layer at its default scale is `100,100,100`.
- **Values:** Write any other one-dimensional value directly in the cell.
- **Images or videos:** The extension currently does not allow file paths to be entered for *replaceables*. To work with these files, see the replaceables section above.
