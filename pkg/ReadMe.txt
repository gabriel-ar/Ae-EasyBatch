EasyBatch

EASY INSTALLATION
The easiest way to install is by using the aescripts + aeplugins manager
https://aescripts.com/learn/aescripts-aeplugins-manager-app/
To install a trial you can select 'Add Trial' from the 'Account' menu.


ALTERNATIVE METHOD
  1) Download and install the ZXP/UXP Installer from https://aescripts.com/learn/post/zxp-installer
  2) Unzip the extension file downloaded from aescripts.com
  3) Open the ZXP Installer, drag and drop the .zxp file that you just extracted
  4) Confirm the installation
  5) Restart After Effects
  6) Enjoy

MANUAL INSTALLATION (LAST RESORT):
  1) Change the extension of the "easybatch_vX.X.zxp" file to .zip
  2) Copy the extracted "EasyBatch" folder into the following folder:

   Windows: C:\Users\{YOUR USER NAME}\AppData\Roaming\Adobe\CEP\extensions

   Mac: /Users/{YOUR USER NAME}/Library/Application Support/Adobe/CEP/extensions
   
   *In both systems, if the folder "extensions" doesn't exist, create it.

  3) 
    - macOS: open a terminal window and execute the following command
      defaults write com.adobe.CSXS.5 PlayerDebugMode 1

    - Winodws: Create a registry entry "PlayerDebugMode" with String value 1 in
      HKEY_CURRENT_USER/Software/Adobe/CSXS.5

  4) Restart After Effects.
  5) In the top menu bar, go to Window > Extensions > EasyBatch