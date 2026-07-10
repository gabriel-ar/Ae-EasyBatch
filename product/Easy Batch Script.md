## Tutorial

Hello friends, welcome to the introduction of EasyBatch. Let’s get started with this template as an example. We want to make versions where we change the ricode at the top, the flag, the name of the country, and the color. So to open the extension we're going to click in window, inside window,   extensions and then EasyBatch.

The first time that we open EasyBatch on an empty project  we're going to be prompted to set up an essential graphics template, this is because our extension uses this feature of After Effects. In case you're not familiar, essential graphics allows you to make versions of your main composition, while also being able to change properties in subcompositions without having to duplicate those. Our extension uses this for convenience and it's pretty easy to use. Okay, let’s do some setup. First you open the essential graphics panel, and select your main composition. Now I’m going to start with all the properties for the left country so I’ll go inside the sub comp of the left side, and here we want to change the name of the country, we want to change the little tricode that shows at the top, we want to change the flag that is one more comp deeper, and we will drag and drop the flag layer, finally We are going to set up the color of the country and the size of the name.

Okay now we are ready with this one, we’ll speed through the other one. Okay, let’s move to EasyBatch. This is how it should look when you open it for the first time once you finish your setup. As you can see, it has the same properties as the essential graphics panel, but is displaying them in the form of columns and the values as rows. Each one of these rows, represents a version of your template.  As you can see, we can add new rows with the letter n and with backspace we can delete them. There’s something else we need to do, and that is to tell the extension how to look for the files we need to import, in this case the flag. Of course, you could manually change one by one, but the extension has a very nice feature when it comes to importing images, and that is that you can give it a pattern and using this pattern it will automatically import these files into your project and substitute them in the template. So, let’s setup the pattern for the left flag, first we’re going to pick a base path, in this case, is the folder that all my flags have in common. As you can see we can see already the first part of our pattern, I’m goint to put a slash as if i’m going iside that folder. All my flags start with FLAG, and then they have the tricode of the county, that I’m going to reuse front the tricode text that I have in my template. As you can see the pattern can use any property existing in that row. Finally  we type jpg, and as you can see your extension is telling us that our file does exist. Now I'm going to set up the other side.

Okay so now we have our template ready for some data. Usually when you're editing the preview, it updates automatically but in this case I'm going to press p to see the new row and you will see a composition called template preview will open. As you can see, our extension will import the files as soon as we type them into the text box. I’m going to finish setting up this match up. And just like that we just had another row of data. Of course this is just the basics, the whole point of our extension is to be able to batch render versions of our comp and that we’re going to see next. But before we continue, I want to show you that you can change how you view this, because if we have too many properties it can be a bit uncomfortable. So if we press the letter d while in the extension, it will show us the detail view and if we press t we will go back to the table view. I encourage you to check the menus, so you can see all the options available and get familiar with the shortcuts.

So let's see how to get data imported into extension. What I did in this case is that I gave Gemini a reference of a website where he could look for all the matchups of the group face of this competition and then it generates me the data that I needed and I combined that then we pre-select the colors that I had for those countries and voila we have what we need to input into our extension. Right now the format that it accepts is a CSV file, but in the future we will have more options.   

The way the CSV importing works is that our extension will look into the first row of every single column and will match that with the name of our properties. If one column has the same name as the properties it will use all that data in the column to fill our templates.

As you can see it imported all the versions we needed. Now I have to tweak some parameters, like the size of some countries but we’re pretty much setup.

The last thing to do is to set up our renders. For that we move to the Output tab. And as you can see we’re also using a pattern to store our renders. It works in exactly the same way. In this case the base path is the folder that all our renders have in common. Then to name each file, I’ll use the tricode of the visiting team vs the tricode of the home team. We can use any field or property from our data. So for example, the first render is going to come out with the left tricode of the first row vs the right tricode of the first row. In this case Mexico vs South Africa.

Finally, before we render, we need to select the rendering parameters, and for that the extension uses templates. It uses output modules templates and render settings templates. Remember that you can edit those going to edit, then Templates. Here for example you can see the PR 221 that we are using. And with that being said we're ready to start rendering, and we just click on the button. As you can see the extension is right now importing the reminder of the flags and is pretty satisfying to see.

Okay so we're done, let's see how those renders came out so we go back to the renders folder and… perfect here are our renders with the proper name. Let’s open a couple, oh beautiful. Well, thank you for your time, I hope you’re excited to use the extension. There are some more cool features the extension has and I will cover them in an advanced tutorial. Take it easy.

## 

## Ideas for Thumbnails

* AUTOMATE RENDERS IN AFTER EFFECTS  
* DELIVER FASTER IN AFTER EFFECTS  
* MAKE VERSIONS OF YOUR COMPS, THE EASY WAY

## Description for Aescripts.com

### Samples from Other Products

| Diffusae 2 Explore and interact directly with generative AI in your favorite application\! New: Temporal consistency model for stability between frames. Available for Windows and Mac. | Quick Chromatic Aberration 3 Add RGB shift & distortion to emulate chromatic aberration from real lenses. And it's Free\! | True Comp Duplicator Creates a complete duplicate of selected comp hierarchies including subcomps with many options. | Displacer Pro The humble AE displacement map with more features \+ juiced up on the GPU. And it's free. NEW: Scale finally works properly \+ better anti-aliasing. |
| :---- | :---- | :---- | :---- |
| **LottieFiles for Adobe After Effects** Explore Lottie animations right within After Effects \- Import animations easily into AE and export them as Lottie JSON or dotLottie. Effortlessly test, preview and implement your Lottie animations across websites, apps and more. | **Bodymovin \- Lottie** An After Effects extension to export Lottie animations. Animations are exported by default as .json files that use the lottie.js player that comes along with the plugin. You can render animations in the browser on svg, canvas and html. It supports a subset of After Effects features. Animations can also be played natively on iOS and Android using Lottie | **EaseCopy** EaseCopy lets you copy/paste your eases without overwriting your values and copy/paste your values without overwriting your eases. | **UnMult** Free\! Remove black to add an alpha channel to a lighting effect |
| **TextEvo 2** TextEvo allows you to easily animate your text with delay based on letters, words or lines. | **Squash & Stretch Free V2** Your behavior-based animation assistant — Squash & Stretch Free creates beautiful, editable keyframes without the manual grind. This Free Version includes 40 hand-crafted behaviors to jumpstart your animations — a perfect way to explore what Squash & Stretch can do.  | **AEVIEWER 2** Totally Free\! Revolutionary media browser for After Effects and Premiere Pro. Preview, apply, and import projects and media files in one click. | **Thicc Stroke** Thicc Stroke is a fully-featured, free, variable-width stroke plugin. |

### Easy Batch Description Short

Make versions of your templates without duplicating comps, batch render them with one click\! Keep your project light and your renders organized.

## Social Media Promo

60s 9:16

| Video | Audio / Voice Over |
| :---- | :---- |
| *Fade up* After Effects UI *Zoom in on composition* Check mark over the design *Zoom out* Edit the comp and render, edit the comp and render Pause icon Crosses over comps | You’re wasting a lot of time delivering graphics, if you’re still manually editing comps and rendering one by one.   What if the client asks for that one more final change, and you have to redo the whole thing. But, you’re in luck.  |
| EasyBatch logo comes out of the clouds with angelical music. *Dissolve to next screen* | Meet EasyBatch: the ultimate extension for smart versioning. |
| Setup a couple of properties in the Essential Graphics panel. Highlight the names of the properties. Click on EB and highlight the same properties now as columns.  **Team vs Team template** | The setup is simple, you just drop your properties in the essential graphics panel and switch to EasyBatch. |
| Use the import feature and show the data populated in the template.  Right click in row and select the "Add Row Below" option, edit the data.   **Team vs Team Template** | Now, you can import your versions from a spreadsheet or edit them inside the extension. |
| On a simple template with only two options, display the extension importing a flag when the tricode in the data changes. Foot note: "The extension automatically updates the preview while editing"  **Team vs Team Template** | If your template has assets that change, like images or videos, EasyBatch can import the files, based on the data you provide.  |
| Move from the Data tab to Output tab. | Once you have all your versions, you can configure the render. |
| Show the file save pattern. Move it to a blank screen and then display versions of these paths already filled with the data and transformed into save paths. Show these files in the file explorer.  **Team vs Team; Ordered by groups** | For example you could set up a custom pattern to automatically name and place your renders however you want, keeping your file structure clean.  |
| Show an infographic that has two versions. One 16:9 and another square. Display a folder structure, with several folders open and each one of them with two files, one 16:9 and the other square. Show a touchdown animation, in different formats.  **Bar graph template** **Multi Screen template for conference screens** | You can also do variations of a template that uses the same data. That would be helpful if you need to create different aspect ratios of the same design. Render all your deliverables, with a single click. |
| Outro logo animation | Download EasyBatch today. See you on the Easy side.  |

## Promo with Hook 

\~70s 16:9

| Video | Audio / Voice Over |
| :---- | :---- |
| *Fade up* After Effects UI *Zoom in on composition* Check mark over the design *Zoom out* Edit the comp and render, edit the comp and render Pause icon Crosses over comps | So.. you finished your design and the client approved it. Now, to make your deliverables you’re manually editing the comp and rendering it, several times. Ohh, hold on, the client asked for a last minute change, now you have to redo all that work. Ahh, you could, but let me show you THE better way… |
| EasyBatch logo comes out of the clouds with angelical music. *Dissolve to next screen* | This is EasyBatch, an After Effects extension that allows you to automate versioning, and batch render multiple variations of your compositions. |
| Setup a couple of properties in the Essential Graphics panel. Highlight the names of the properties. Click on EB and highlight the same properties now as columns.  **Team vs Team template** | The setup is simple, you just drop your properties in the essential graphics panel and then switch to EasyBatch. |
| Use the import feature and show the data populated in the template.  Right click in row and select the "Add Row Below" option, edit the data.   **Team vs Team Template** | Now, you can edit your versions right inside the extension or you can import them from a spreadsheet. |
| On a simple template with only two options, display the extension importing a flag when the tricode in the data changes. Foot note: "The extension automatically updates the preview while editing"  **Team vs Team Template** | If your template has assets that change, like images or videos, EasyBatch can even import the files, based on the data you provide.  |
| Move from the Data tab to Output tab. | Once you have all your versions, you can configure the render. |
| Show the file save pattern. Move it to a blank screen and then display versions of these paths already filled with the data and transformed into save paths. Show these files in the file explorer.  **Team vs Team; Ordered by groups** | For example you could set up a custom pattern to automatically name and place your renders however you want, keeping your file structure clean.  |
| Show an infographic that has two versions. One 16:9 and another square. Display a folder structure, with several folders open and each one of them with two files, one 16:9 and the other square. Show a touchdown animation, in different formats.  **Bar graph template** **Multi Screen template for conference screens** | You can also do variations of a template that uses the same data. That would be helpful if you need to create different aspect ratios of the same design.  |
| Outro logo animation | No sign-ups, no fees, no subscriptions—just After Effects. Check out EasyBatch. See you on the Easy side. |

## Competitive Advantage Promo

V2

| Video | Audio / Voice Over |
| :---- | :---- |
| Logo animates and expands into  the extension panel. In 3D, several versions of templates are displayed with properties changed.   **Bar graph template** | Welcome to **EasyBatch**, an After Effects extension that allows you to batch render multiple versions of your compositions. |
| Inside AE, show the project panel, with several compositions that imply versions of a template. Then delete them. In the file explorer show AE project files with several versions of the same project, then delete them. | EasyBatch leverages the power of the Essential Graphics feature in After Effects. Keeping your project lightweight and organized—say goodbye to duplicated comps or managing project files for every version. |
| Setup a couple of properties in the Essential Graphics panel. Highlight the names of the properties. Click on EB and highlight the same properties now as columns.  **Team vs Team template** | To start, simply set up your template composition using the Essential Graphics panel, then switch to EasyBatch. Your properties are ready to be populated. |
| Use the import feature and show the data populated in the template.  Right click in row and select the "Add Row Below" option, edit the data.   **Team vs Team Template** | Import your data directly from an external spreadsheet, **or** edit right inside the extension—no need to leave After Effects. This data can always be exported. |
| On a simple template with only two options, display the extension importing a flag when the tricode in the data changes. Foot note: "The extension automatically updates the preview while editing"  **Team vs Team Template** | If your template needs to swap assets, EasyBatch can smartly handle asset importing, pulling the correct files from your storage based on the data you provide. Also, watch the real-time preview update, as you work. |
| Move from the Data tab to Output tab. | Once your data is set, you're ready to define your batch render settings. |
| Show the file save pattern. Move it to a blank screen and then display versions of these paths already filled with the data and transformed into save paths. Show these files in the file explorer.  **Team vs Team; Ordered by groups** | For example you can set up a custom pattern to automatically name and place your renders however you want, keeping your file structure clean and efficient.  |
| Show an infographic that has two versions. One 16:9 and another square. Display a folder structure, with several folders open and each one of them with two files, one 16:9 and the other square. Show a touchdown animation, in different formats.  **Bar graph template** **Multi Screen template for conference screens** | You can also set up EasyBatch to do variations of a template that uses the same data. For example, to generate different aspect ratios or specialized assets for other platforms like game engines, real-time graphics, or media servers. Each variation can have its own custom save pattern in case you need a specific folder structure.  |
| Outro logo animation | Stop rendering, start designing. Check out EasyBatch. See you on the Easy side. |

V1

| Video | Audio / Voice Over |
| :---- | :---- |
| Logo Animates and expands into extension panel. In 3D, several versions of templates are displayed, with properties changed. **Bar graph template** | Welcome to EasyBatch, an After Effects extension that allows you to create multiple versions of your templates and batch render them. |
| Inside AE, show the project panel, with several compositions that imply versions of a template. Then delete them. In the file explorer show AE project files with several versions of the same project, then delete them. | The extension uses the Essential Graphics feature of After Effects. This allows it to keep your project lightweight and organized. No need to duplicate comps, or having several versions of the project. |
| Setup a couple of properties in the Essential Graphics panel. Highlight the names of the properties. Click on EB and highlight the same properties now as columns. **Team vs Team template** | To start, simply set up your template composition with the essential graphics panel, and then move to EasyBatch. |
| Use the import feature and show the data populated in the template. Right click in row and select the “Add Row Below” option, edit the data. **Team vs Team Template** | To fill your templates you can import data from an external spreadsheet, or you can edit in the same extension, no need for other software and no need to leave After Effects. This data can always be exported, by the way. |
| On a simple template with only two options, display the extension importing a flag, when the tricode in the data changes. Foot note: “The extension automatically updates the preview while editing” **Team vs Team Template** | The extension can also handle the importing of assets, and can smartly pull them from your storage, based on the data you input. |
| Move from the Data tab to Output tab. | Once you have the data for your template, you are ready to set up your batch render. |
| Show the file save pattern. Move it to a blank screen and then display versions of these paths already filled with the data and transformed into save paths. Show these files in the file explorer. **Team vs Team; Ordered by groups** | The extension can even handle the organization of your renders. You can define a pattern that helps to place and name your renders, keeping everything tidy. |
| Show an infographic that has two versions. One 16:9 and another square. Display a folder structure, with several folders open and each one of them with two files, one 16:9 and the other square. Show a touchdown animation, in different formats. **Bar graph template Multi Screen template for conference screens** | You can also set up EasyBatch to do variations of a template, with the same data. For example, you could export different aspect ratios of an infographic, or create assets for another software, like game engines, real time graphics machines or media servers. These variations can also be configured with custom save patterns in case you need a specific folder structure. |
| Outro logo animation | Check out EasyBatch if you need variations for your motion graphics work. See you on the Easy side. |

