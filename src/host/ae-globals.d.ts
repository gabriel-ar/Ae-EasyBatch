// Pull in all types-for-adobe definitions.
// Using /// <reference path> because typeRoots only works with @types/ packages.

/// <reference path="../../node_modules/types-for-adobe/shared/JavaScript.d.ts" />
/// <reference path="../../node_modules/types-for-adobe/shared/PlugPlugExternalObject.d.ts" />
/// <reference path="../../node_modules/types-for-adobe/shared/global.d.ts" />
/// <reference path="../../node_modules/types-for-adobe/shared/XMPScript.d.ts" />
/// <reference path="../../node_modules/types-for-adobe/AfterEffects/24.6/index.d.ts" />

// ─── Globals missing from types-for-adobe ────────────────────────────────────

/**
 * JSON is available in After Effects via the bundled json2.js include.
 * Not declared in types-for-adobe — defined here so host.jsx gets type checking.
 */
interface JSON {
  parse(text: string): any;
  stringify(value: any): string;
  stringify(value: any, replacer: ((key: string, value: any) => any) | null): string;
  stringify(value: any, replacer: null | undefined, space: string | number): string;
}
declare var JSON: JSON;

// ─── XMPScript corrections ────────────────────────────────────────────────────
// types-for-adobe/shared/XMPScript.d.ts has incomplete signatures for the
// methods actually used by After Effects scripts. Extend the interfaces here.

// AdobeXMPScript static property is referenced in XMPScript.d.ts on
// ExternalObjectConstructor but not on ExternalObject itself.
interface ExternalObjectConstructor {
  /** Set by AdobeXMPScript once loaded: `new ExternalObject("lib:AdobeXMPScript")` */
  AdobeXMPScript: ExternalObject | undefined;
}

interface XMPMetaConstructor {
  /**
   * Registers a namespace URI with a suggested prefix.
   * @param namespaceURI The URI for the namespace.
   * @param suggestedPrefix The suggested prefix.
   * @returns The actual registered prefix (may differ if prefix was taken).
   */
  registerNamespace(namespaceURI: string, suggestedPrefix: string): string;
}

interface XMPMetaInstance {
  /**
   * Gets the value of a property. The third argument is an options bitmask
   * (e.g. XMPConst.STRING). types-for-adobe omits the options argument.
   */
  getProperty(namespace: string, property: string, valueType?: number): XMPProperty;
  /**
   * Sets the value of a property. The full AE-used signature takes value,
   * options bitmask, and type bitmask as extra args after the property name.
   */
  setProperty(namespace: string, property: string, value: string, options?: number, valueType?: number): boolean;
}

interface XMPConstConstructor {
  /** Indicates the value type is a simple string. */
  STRING: number;
  /** Indicates the value type is an integer. */
  INTEGER: number;
  /** Indicates the value type is a float. */
  FLOAT: number;
  /** Indicates the value type is a boolean. */
  BOOLEAN: number;
}

// ─── AVLayer / Layer augmentations ───────────────────────────────────────────
// types-for-adobe 24.6 omits essentialProperty from AVLayer and source from the
// base Layer class. Use interface merging (interfaces can augment classes in TS)
// to add these without redeclaring the whole class.

interface AVLayer {
  /**
   * The essential properties (Motion Graphics template overrides) for this layer.
   * Returns a PropertyGroup containing the template's exposed controls.
   */
  readonly essentialProperty: PropertyGroup;
}

// Layer is the base class. CompItem.layer() / iteration over LayerCollection
// returns Layer, but at runtime they are AVLayer. Add .source here so code
// that uses Layer variables can access it without casts everywhere.
interface Layer {
  /** The source AVItem for this layer. Cast to CompItem/FootageItem as needed. */
  readonly source: AVItem;
  /** The essential properties group (Motion Graphics template overrides). */
  readonly essentialProperty: PropertyGroup;
}

// ─── RenderQueue augmentations ────────────────────────────────────────────────
// types-for-adobe omits renderAsync (the non-blocking form of render).

interface RenderQueue {
  /**
   * Starts rendering asynchronously without blocking the script.
   * Available in After Effects CS6+.
   */
  renderAsync(): void;
}

// ─── CompItem augmentations ───────────────────────────────────────────────────
// CompItem.saveFrameToPng is documented in AE scripting guide but missing from types.

interface CompItem {
  /**
   * Saves the current frame to a PNG file.
   * @param time The frame time, in seconds.
   * @param file The File object to save to.
   */
  saveFrameToPng(time: number, file: File): void;
}

// ─── Object.create polyfill (ES3) ────────────────────────────────────────────
// host.jsx defines its own Object.create polyfill for ES3 compatibility.
// The ES3 ObjectConstructor in types-for-adobe doesn't include .create.
// Extend it here so the polyfill assignment doesn't trigger an error.

interface ObjectConstructor {
  create(proto: object | null, properties?: any): any;
}

// ─── String.prototype.replaceAll (polyfilled in host.jsx) ─────────────────────
// host.jsx defines a String.prototype.replaceAll polyfill. Augment String here.

interface String {
  replaceAll(searchValue: string, replaceValue: string): string;
  replaceAll(searchValue: string, replacer: (match: string, ...args: any[]) => string): string;
}

// ─── Shared types from client-side modules ────────────────────────────────────
// Declaring these globally here removes the need for @typedef imports in host.jsx.

type ProjSettings    = import('../lib/Settings').ProjSettings;
type ProjData        = import('../lib/Settings').ProjData;
type TemplateData    = import('../lib/Settings').TemplateData;
type ColumnData      = import('../lib/Settings').ColumnData;
type Comp            = import('../lib/Settings').Comp;
type DepCompSetts    = import('../lib/Settings').DepCompSetts;

type GetSettsResult          = import('../lib/Messaging').GetSettsResult;
type GetAllCompsResult       = import('../lib/Messaging').GetAllCompsResult;
type GetSelectedCompsResult  = import('../lib/Messaging').GetSelectedCompsResult;
type SaveSettingsResults     = import('../lib/Messaging').SaveSettingsResults;
type BatchRenderResult       = import('../lib/Messaging').BatchRenderResult;
type RenderSettsResults      = import('../lib/Messaging').RenderSettsResults;
type BatchGenerateResult     = import('../lib/Messaging').BatchGenerateResult;
type GetCurrentValuesResults = import('../lib/Messaging').GetCurrentValuesResults;
type GetTmplsResult          = import('../lib/Messaging').GetTmplsResult;
type HostTemplateData        = import('../lib/Messaging').HostTemplateData;
type HostColumnData          = import('../lib/Messaging').HostColumnData;
type PreviewRowResult        = import('../lib/Messaging').PreviewRowResult;
type SaveSettsRequest        = import('../lib/Messaging').SaveSettsRequest;
type IsSameProjectResult     = import('../lib/Messaging').IsSameProjectResult;
