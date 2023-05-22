import { TreeBase } from "./treebase";
import { Stack } from "./stack";
import { PatternGroup } from "components/access/pattern";
import { Page } from "components/page";

import "css/toolbar.css";
import db from "app/db";
import { html } from "uhtml";
import Globals from "app/globals";
import { Menu, MenuItem } from "./menu";
import { callAfterRender } from "app/render";
import { fileOpen } from "browser-fs-access";
import pleaseWait from "components/wait";
import { DB } from "app/db";
import { Designer } from "./designer";
import { readSheetFromBlob, saveContent } from "./content";
import { Data } from "app/data";
import { SaveLogs, ClearLogs } from "./logger";

/**
 * Map the classname into the Menu name and the Help Wiki page name
 */
const namesMap = {
  Action: ["Action", "Actions"],
  ActionCondition: ["Condition", "Actions#Condition"],
  Actions: ["Actions", "Actions"],
  ActionUpdate: ["Update", "Actions#Update"],
  Audio: ["Audio", "Audio"],
  Button: ["Button", "Button"],
  Content: ["Content", "Content"],
  CueCircle: ["Circle", "Cues"],
  CueCss: ["CSS", "Cues#CSS"],
  CueFill: ["Fill", "Cues#Fill"],
  CueList: ["Cues", "Cues"],
  CueOverlay: ["Overlay", "Cues#Overlay"],
  Customize: ["Customize", "Customize"],
  Designer: ["Designer", "Designer"],
  Display: ["Display", "Display"],
  Filter: ["Filter", "Patterns#Filter"],
  Gap: ["Gap", "Gap"],
  Grid: ["Grid", "Grid"],
  GridFilter: ["Filter", "Grid#Filter"],
  GroupBy: ["Group By", "Patterns#Group By"],
  HandlerCondition: ["Condition", "Methods#Condition"],
  HandlerKeyCondition: ["Key Condition", "Methods#Key Condition"],
  HandlerResponse: ["Response", "Methods#Response"],
  KeyHandler: ["Key Handler", "Methods#Key Handler"],
  Layout: ["Layout", "Layout"],
  Logger: ["Logger", "Logger"],
  Method: ["Method", "Methods"],
  MethodChooser: ["Methods", "Methods"],
  ModalDialog: ["Modal Dialog", "Modal Dialog"],
  Option: ["Option", "Radio#Option"],
  OrderBy: ["Order By", "Patterns#Order By"],
  Page: ["Page", "Page"],
  PatternGroup: ["Group", "Patterns"],
  PatternList: ["Patterns", "Patterns"],
  PatternManager: ["Pattern", "Patterns"],
  PatternSelector: ["Selector", "Patterns"],
  PointerHandler: ["Pointer Handler", "Methods#Pointer Handler"],
  Radio: ["Radio", "Radio"],
  ResponderActivate: ["Activate", "Methods#Activate"],
  ResponderCue: ["Cue", "Methods#Cue"],
  ResponderClearCue: ["Clear Cue", "Methods#Clear Cue"],
  ResponderEmit: ["Emit", "Methods#Emit"],
  ResponderNext: ["Next", "Methods#Next"],
  ResponderStartTimer: ["Start Timer", "Methods"],
  Speech: ["Speech", "Speech"],
  Stack: ["Stack", "Stack"],
  TabControl: ["Tab Control", "Tab Control"],
  TabPanel: ["Tab Panel", "Tab Panel"],
  Timer: ["Timer", "Methods#Timer"],
  TimerHandler: ["Timer Handler", "Methods#Timer Handler"],
  VSD: ["VSD", "VSD"],
};

/**
 * Get the name for a menu item from the class name
 * @param {string} className
 */
function friendlyName(className) {
  return namesMap[className][0];
}

/**
 * Get the Wiki name from the class name
 * @param {string} className
 */
function wikiName(className) {
  return namesMap[className][1].replace(" ", "-");
}

/** Return a list of available Menu items on this component
 *
 * @param {TreeBase} component
 * @param {"add" | "delete" | "move" | "all"} which - which actions to return
 * @param {function} wrapper
 * @returns {MenuItem[]}
 */
function getComponentMenuItems(component, which = "all", wrapper) {
  /** @type {MenuItem[]} */
  const result = [];

  // add actions
  if (which == "add" || which == "all") {
    for (const className of component.allowedChildren.sort()) {
      result.push(
        new MenuItem({
          label: `${friendlyName(className)}`,
          callback: wrapper(() => {
            const result = TreeBase.create(className, component);
            result.init();
            return result.id;
          }),
        })
      );
    }
  }
  // delete
  if (which == "delete" || which == "all") {
    if (component.allowDelete) {
      result.push(
        new MenuItem({
          label: `Delete`,
          title: `Delete ${friendlyName(component.className)}`,
          callback: wrapper(() => {
            // remove returns the id of the nearest neighbor or the parent
            const nextId = component.remove();
            return nextId;
          }),
        })
      );
    }
  }

  // move
  if (which == "move" || which == "all") {
    const parent = component.parent;
    if (parent) {
      const index = component.index;

      if (index > 0) {
        // moveup
        result.push(
          new MenuItem({
            label: `Move up`,
            title: `Move up ${friendlyName(component.className)}`,
            callback: wrapper(() => {
              parent.swap(index, index - 1);
              return component.id;
            }),
          })
        );
      }
      if (index < parent.children.length - 1) {
        // movedown
        result.push(
          new MenuItem({
            label: `Move down`,
            title: `Move down ${friendlyName(component.className)}`,
            callback: wrapper(() => {
              parent.swap(index, index + 1);
              return component.id;
            }),
          })
        );
      }
    }
  }
  return result;
}

/**
 * Determines valid menu items given a menu type.
 * @param {"add" | "delete" | "move" | "all"} type
 * @return {{ child: MenuItem[], parent: MenuItem[]}}
 * */
function getPanelMenuItems(type) {
  // Figure out which tab is active
  const { designer } = Globals;
  const panel = designer.currentPanel;

  // Ask that tab which component is focused
  if (!panel) {
    console.log("no panel");
    return { child: [], parent: [] };
  }
  const component = TreeBase.componentFromId(panel.lastFocused) || panel;
  if (!component) {
    console.log("no component");
    return { child: [], parent: [] };
  }

  /** @param {function():string} arg */
  function itemCallback(arg) {
    return () => {
      let nextId = arg();
      if (!panel) return;
      // we're looking for the settings view but we may have the id of the user view
      if (panel.lastFocused.startsWith(nextId)) {
        nextId = panel.lastFocused;
      }
      if (nextId.match(/^TreeBase-\d+$/)) {
        nextId = nextId + "-settings";
      }
      panel.lastFocused = nextId;
      callAfterRender(() => panel.parent?.restoreFocus());
      panel.update();
    };
  }

  // Ask that component for its menu actions
  let menuItems = getComponentMenuItems(component, type, itemCallback);

  // Add the parent's actions in some cases
  const parent = component.parent;

  let parentItems = [];
  if (
    type === "add" &&
    parent &&
    !(component instanceof Stack && parent instanceof Stack) &&
    !(component instanceof PatternGroup && parent instanceof PatternGroup) &&
    !(parent instanceof Designer)
  ) {
    parentItems = getComponentMenuItems(parent, type, itemCallback);
    // if (menuItems.length && parentItems.length) {
    //   parentItems[0].divider = "Parent";
    // }
    // menuItems = menuItems.concat(parentItems);
  }

  return { child: menuItems, parent: parentItems };
}

/** @param {ToolBar} bar */
function getFileMenuItems(bar) {
  return [
    new MenuItem({
      label: "Import",
      callback: async () => {
        const local_db = new DB();
        fileOpen({
          mimeTypes: ["application/octet-stream"],
          extensions: [".osdpi", ".zip"],
          description: "OS-DPI designs",
          id: "os-dpi",
        })
          .then((file) => pleaseWait(local_db.readDesignFromFile(file)))
          .then(() => {
            window.open(`#${local_db.designName}`, "_blank", "noopener=true");
          })
          .catch((e) => console.log(e));
      },
    }),
    new MenuItem({
      label: "Export",
      callback: () => {
        db.saveDesign();
      },
    }),
    new MenuItem({
      label: "New",
      callback: async () => {
        const name = await db.uniqueName("new");
        window.open(`#${name}`, "_blank", "noopener=true");
      },
    }),
    new MenuItem({
      label: "Open",
      callback: () => {
        bar.designListDialog.open();
      },
    }),
    new MenuItem({
      label: "Unload",
      callback: async () => {
        const saved = await db.saved();
        if (saved.indexOf(db.designName) < 0) {
          try {
            await db.saveDesign();
          } catch (e) {
            if (e instanceof DOMException) {
              console.log("canceled save");
            } else {
              throw e;
            }
          }
        }
        await db.unload(db.designName);
        window.close();
      },
    }),
    new MenuItem({
      label: "Load Sheet",
      title: "Load a spreadsheet of content",
      divider: "Content",
      callback: async () => {
        try {
          const blob = await fileOpen({
            extensions: [".csv", ".tsv", ".ods", ".xls", ".xlsx"],
            description: "Spreadsheets",
            id: "os-dpi",
          });
          if (blob) {
            sheet.handle = blob.handle;
            const result = await pleaseWait(readSheetFromBlob(blob));
            await db.write("content", result);
            Globals.data = new Data(result);
            Globals.state.update();
          }
        } catch (e) {
          sheet.handle = undefined;
        }
      },
    }),
    new MenuItem({
      label: "Reload sheet",
      title: "Reload a spreadsheet of content",
      callback:
        sheet.handle && // only offer reload if we have the handle
        (async () => {
          if (!sheet.handle) return;
          let blob;
          blob = await sheet.handle.getFile();
          if (blob) {
            const result = await pleaseWait(readSheetFromBlob(blob));
            await db.write("content", result);
            Globals.data = new Data(result);
            Globals.state.update();
          } else {
            console.log("no file to reload");
          }
        }),
    }),
    new MenuItem({
      label: "Save sheet",
      title: "Save the content as a spreadsheet",
      callback: () => {
        saveContent(db.designName, Globals.data.allrows, "xlsx");
      },
    }),
    new MenuItem({
      label: "Load media",
      title: "Load audio or images into the design",
      callback: async () => {
        try {
          const files = await fileOpen({
            description: "Media files",
            mimeTypes: ["image/*", "audio/*", "video/mp4", "video/webm"],
            multiple: true,
          });
          for (const file of files) {
            await db.addMedia(file, file.name);
            if (file.type.startsWith("image/")) {
              for (const img of document.querySelectorAll(
                `img[dbsrc="${file.name}"]`
              )) {
                /** @type {ImgDb} */ (img).refresh();
              }
            }
            if (file.type.startsWith("video/")) {
              for (const img of document.querySelectorAll(
                `video[dbsrc="${file.name}"]`
              )) {
                /** @type {ImgDb} */ (img).refresh();
              }
            }
          }
        } catch {}
        Globals.state.update();
      },
    }),
    new MenuItem({
      label: "Save logs",
      title: "Save any logs as spreadsheets",
      divider: "Logs",
      callback: async () => {
        SaveLogs();
      },
    }),
    new MenuItem({
      label: "Clear logs",
      title: "Clear any stored logs",
      callback: async () => {
        ClearLogs();
      },
    }),
  ];
}

function getEditMenuItems() {
  let items = [
    new MenuItem({
      label: "Undo",
      callback: () => {
        Globals.designer.currentPanel?.undo();
      },
    }),
    new MenuItem({
      label: "Copy",
      callback: async () => {
        const component = Globals.designer.selectedComponent;
        if (component) {
          const parent = component.parent;
          if (!(component instanceof Page) && !(parent instanceof Designer)) {
            const json = JSON.stringify(component.toObject());
            navigator.clipboard.writeText(json);
          }
        }
      },
    }),
    new MenuItem({
      label: "Cut",
      callback: async () => {
        const component = Globals.designer.selectedComponent;
        if (!component) return;
        const json = JSON.stringify(component.toObject());
        await navigator.clipboard.writeText(json);
        component.remove();
        Globals.designer.currentPanel?.onUpdate();
      },
    }),
    new MenuItem({
      label: "Paste",
      callback: async () => {
        const json = await navigator.clipboard.readText();
        const obj = JSON.parse(json);
        const className = obj.className;
        if (!className) return;
        // find a place that can accept it
        const anchor = Globals.designer.selectedComponent;
        if (!anchor) return;
        /** @type {TreeBase | null } */
        let current = anchor;
        while (current) {
          if (current.allowedChildren.indexOf(className) >= 0) {
            const result = TreeBase.fromObject(obj, current);
            if (
              anchor.parent === result.parent &&
              result.index != anchor.index + 1
            ) {
              anchor.moveTo(anchor.index + 1);
            }
            Globals.designer.currentPanel?.onUpdate();
            return;
          }
          current = current.parent;
        }
      },
    }),
    new MenuItem({
      label: "Paste Into",
      callback: async () => {
        const json = await navigator.clipboard.readText();
        const obj = JSON.parse(json);
        const className = obj.className;
        if (!className) return;
        // find a place that can accept it
        const current = Globals.designer.selectedComponent;
        if (current && current.allowedChildren.indexOf(className) >= 0) {
          TreeBase.fromObject(obj, current);
          Globals.designer.currentPanel?.onUpdate();
        }
      },
    }),
  ];
  const deleteItems = getPanelMenuItems("delete");
  const moveItems = getPanelMenuItems("move");
  items = items.concat(moveItems.child, deleteItems.child);
  const parentItems = moveItems.parent.concat(deleteItems.parent);
  if (parentItems.length > 0) {
    parentItems[0].divider = "Parent";
    items = items.concat(parentItems);
  }
  return items;
}

/** Open Wiki documentation in another tab
 * @param {string} name
 */
function openHelpURL(name) {
  const wiki = "https://github.com/unc-project-open-aac/os-dpi/wiki";

  const url = `${wiki}/${name}`;

  window.open(url, "help");
}

function getHelpMenuItems() {
  /** @type {MenuItem[]} */
  const items = [];
  const names = new Set();
  let component =
    Globals.designer.selectedComponent || Globals.designer.currentPanel;
  while (component && component.parent) {
    const className = component.className;
    const menuName = friendlyName(className);
    if (!names.has(menuName)) {
      items.push(
        new MenuItem({
          label: menuName,
          callback: openHelpURL,
          args: [wikiName(className)],
        })
      );
      names.add(menuName);
    }
    component = component.parent;
  }
  items.push(
    new MenuItem({
      label: "About OS-DPI",
      callback: openHelpURL,
      args: ["About-Project-Open"],
    })
  );
  return items;
}

/**
 * @param {Hole} thing
 * @param {string} hint
 */
function hinted(thing, hint) {
  return html`<div hint=${hint}>${thing}</div>`;
}

const sheet = {
  /** @type {FileSystemFileHandle | undefined } */
  handle: undefined,
};

/**
 * Display a list of designs in the db so they can be reopened
 */
class DesignListDialog {
  async open() {
    const names = await db.names();
    const dialog = /** @type {HTMLDialogElement} */ (
      document.getElementById("OpenDialog")
    );
    const list = html.node`<div
        onclick=${() => dialog.close()}
      >
      <h1>Open one of your designs</h1>
      <ul>
        ${names.map(
          (name) => html`<li>
            <a href=${"#" + name} target="_blank">${name}</a>
          </li>`
        )}
      </ul>
      <button>Cancel</button>
      </div>`;
    if (dialog) {
      dialog.innerHTML = "";
      dialog.appendChild(list);
    }
    dialog.showModal();
  }
  render() {
    return html`<dialog id="OpenDialog"></dialog>`;
  }
}

export class ToolBar extends TreeBase {
  constructor() {
    super();
    this.fileMenu = new Menu("File", getFileMenuItems, this);
    this.editMenu = new Menu("Edit", getEditMenuItems);
    this.addMenu = new Menu(
      "Add",
      () => {
        const { child, parent } = getPanelMenuItems("add");
        if (parent.length > 0) {
          parent[0].divider = "Parent";
        }
        return child.concat(parent);
      },
      "add"
    );
    this.helpMenu = new Menu("Help", getHelpMenuItems, this);
    this.designListDialog = new DesignListDialog();
  }

  template() {
    return html`
      <div class="toolbar brand">
        <ul>
          <li>
            <label for="designName">Name: </label>
            ${hinted(
              html` <input
                id="designName"
                type="text"
                .value=${db.designName}
                .size=${Math.max(db.designName.length, 12)}
                onchange=${(/** @type {InputEventWithTarget} */ event) =>
                  db
                    .renameDesign(event.target.value)
                    .then(() => (window.location.hash = db.designName))}
              />`,
              "N"
            )}
          </li>
          <li>
            ${
              // @ts-ignore
              hinted(this.fileMenu.render(), "F")
            }
          </li>
          <li>
            ${
              // @ts-ignore
              hinted(this.editMenu.render(), "E")
            }
          </li>
          <li>
            ${
              // @ts-ignore
              hinted(this.addMenu.render(), "A")
            }
          </li>
          <li>
            ${
              // @ts-ignore
              hinted(this.helpMenu.render(), "H")
            }
          </li>
        </ul>
        ${this.designListDialog.render()}
      </div>
    `;
  }
}
TreeBase.register(ToolBar, "ToolBar");
