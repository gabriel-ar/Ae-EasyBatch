interface Listener {
  combined: string;
  callback: (event?: any) => void;
  prevent: boolean;
}

interface Listeners {
  [key: string]: Listener;
}

/**
 * This class allows to define shortcuts by name and listens
 * to the keys combinations at document level.
 * When a key combination matches with a registered shortcut
 * the corresponding callback is executed.
 * It also allows to manually call a shortcut by its name; Useful for menus.
 */
export default class ActionCoordinator {
  listeners: Listeners;

  /**
   * When true, the execution of shortcuts will be paused.
   * Useful when a form element needs to use the default browser behavior.
   * @type {boolean}
   */
  pause: boolean = false;

  constructor() {
    this.listeners = {};
  }

  Init(): void {
    //We add a window level listener
    document.onkeydown = (e: KeyboardEvent) => {
      this.KeyPressed(e);
    };
  }

  /**
   * Called by the document.onkeydown event listener.
   * It iterates though the defined shortcuts and finds matches with the keys pressed.
   * @param e
   * @constructor
   */
  KeyPressed(e: KeyboardEvent): void {
    //If this class is paused, the callback is ignored.
    if (this.pause) return;

    //we convert this to the combined_short code
    let combined = this.CombinedFromEvent(e);

    //Iterates through all the stored callbacks and checks if the
    // generated shortcut combined is the same we just created from the event
    for (let key in this.listeners) {
      if (this.listeners[key].combined === combined) {
        this.listeners[key].callback(e);

        //Prevent default if the user choose to
        if (this.listeners[key].prevent) e.preventDefault();
      }
    }
  }

  /**
   * Adds a shortcut listener to the list.
   * @param name {string}
   * @param callback {function} The function to call when the key combination is pressed
   * @param key {string} The key to listen to
   * @param control {boolean} Modified by the control key
   * @param shift {boolean} Modified by the shift key
   * @param alt {boolean} Modified by the alt key
   * @param prevent {boolean} If true, the default behavior of the browser is prevented.
   */
  AddListener(
    name: string,
    callback: (event?: any) => void,
    key: string,
    control: boolean = false,
    shift: boolean = false,
    alt: boolean = false,
    prevent: boolean = true
  ): void {
    let combined_short: string = this.#Combined(key, control, shift, alt);

    this.listeners[name] = {
      combined: combined_short,
      callback: callback,
      prevent: prevent,
    };
  }

  /**
   * Returns a string that represents the combination of keys pressed.
   * @param e {KeyboardEvent}
   * @returns {string}
   */
  CombinedFromEvent(e: KeyboardEvent): string {
    return this.#Combined(e.key, e.ctrlKey, e.shiftKey, e.altKey);
  }

  /**
   *
   * @param key {string}
   * @param control
   * @param shift
   * @param alt
   * @returns {string}
   */
  #Combined(
    key: string,
    control: boolean = false,
    shift: boolean = false,
    alt: boolean = false
  ): string {
    let final_comb = "";

    if (control) final_comb = final_comb + "C";

    if (shift) final_comb = final_comb + "S";

    if (alt) final_comb = final_comb + "A";

    final_comb = final_comb + key.toLowerCase();
    return final_comb;
  }

  /**
   * @param name {string} name of the listener to call back
   * @param event {any}
   */
  Fire(name: string, event: any = null): void {
    let listener = this.listeners[name];

    if (listener !== undefined) {
      listener.callback(event);
    }
  }
}
