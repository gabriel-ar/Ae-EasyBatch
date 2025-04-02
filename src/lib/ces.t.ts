    declare namespace cep {

        namespace util{

            function openURLInDefaultBrowser(url: string): void;
        }

        namespace fs {
            interface OpenDialogResult {
                data: string[]; // Array of the full names of the selected files
                err: 'NO_ERROR' | 'ERR_INVALID_PARAMS'; // Status of the operation
            }

            /**
             * Displays the OS File Open dialog, allowing the user to select files or directories.
             *
             * @param allowMultipleSelection - When true, multiple files/folders can be selected.
             * @param chooseDirectory - When true, only folders can be selected. When false, only files can be selected.
             * @param title - Title of the open dialog.
             * @param initialPath - Initial path to display in the dialog. Pass NULL or "" to display the last path chosen.
             * @param fileTypes - The file extensions (without the dot) for the types of files that can be selected. Ignored when chooseDirectory=true.
             * @returns An object containing the selected files and the status of the operation.
             */
            function showOpenDialogEx(
                allowMultipleSelection: boolean,
                chooseDirectory: boolean,
                title?: string,
                initialPath?: string,
                fileTypes?: string[]
            ): OpenDialogResult;
        }
    }