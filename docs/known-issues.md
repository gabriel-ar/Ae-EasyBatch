### Data Tab

#### Copy Data from Preview
Given a bug or restriction in After Effects CEP, when reading the values of Essential Properties for text properties, it returns the default of the template and not the current value applied to to that property.

#### Color picker
In both Windows and Mac, the color picker available to CEP is the OS default. In Mac this will bring inconsistencies when sampling colors, for some reason the color will have variations from the ones in screen. Possibly because of the default color profile.

In Windows the color picker doesn't even provide a sampler.

*Possible Workaround:* Use the copy data from preview feature.

### Export Tab

#### Exporting PNG Frames
Even if you're exporting a single frame of a PNG sequence, After Effects will attach a number sequence to the end of the filename. `FinalRender.png` will be exported as `FinalRender.png00000`

A possible development workaround is to use the `Save Frame As` command from the `Composition` menu.

#### Start Batch Render on Windows

When clicking on the`Start Batch Render` button on Windows, it will queue up all the compositions and then block the UI, not displaying the progress. Once it finishes rendering the queue, it will unblock the UI and display all the finished jobs.
