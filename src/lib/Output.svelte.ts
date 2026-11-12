import { l, s, csa } from "./States.svelte.ts";
import { TemplateHelper, type TemplateData, type Comp } from "./Settings.svelte.ts";
import type {
  BatchRenderResult,
  BatchGenerateResult,
  GetAllCompsResult,
  RowRenderResult,
} from "./Messaging";

/**Callbacks the app registers so output actions can open modals and update the status footer.*/
export const output_hooks = {
  Message: (msg: string, title: string): void => {},
  Footer: (txt: string, long_msg = ""): void => {},
  CanProceed: (): boolean => true,
};

/**State shared between the output tab and the rest of the app (row render shortcuts, startup).*/
export const out = $state({
  /**User facing render results*/
  render_results: [] as RowRenderResult[],
  dep_row_results: [] as RowRenderResult[],
  user_stopped_deps: false,
  all_comps: [] as Comp[],
});

export async function GetAllComps(): Promise<void> {
  const result = await csa.Exec<GetAllCompsResult>("GetAllComps");
  if (!result.success) {
    l.error("Failed to get all comps", result.error_obj);
    return;
  }

  out.all_comps = result.comps ?? [];
  s.proj.tmpls.forEach((tmpl) =>
    TemplateHelper.UpdateDependantCompNames(tmpl, out.all_comps),
  );
  l.debug(`Got All Comps`, out.all_comps);
}

/**Renders only the selected row instead of batch rendering*/
export function RenderRow(row_i: number) {
  switch (s.tmpl.out_mode) {
    case "render":
      BatchRender(row_i);
      break;
    case "dependant":
      BatchOneToMany(row_i);
      break;
  }
}

/**Returns a copy of the resolved template trimmed to the checked rows, or null (after warning the user) if none are checked.*/
function FilterEnabledRows(tmpl: TemplateData): TemplateData | null {
  const rows = TemplateHelper.EnabledRows(tmpl);
  if (rows.length === 0) {
    output_hooks.Message("Check at least one row to render.", "No Rows Selected");
    return null;
  }
  if (rows.length === TemplateHelper.RowCount(tmpl)) return tmpl;
  const copy = structuredClone($state.snapshot(tmpl)) as TemplateData;
  TemplateHelper.KeepRows(copy, rows);
  return copy;
}

export function BatchRender(row_i: number = -1, start_queue: boolean = true) {
  l.log("BatchRender called");

  //check if we should 'proceed'
  if (!output_hooks.CanProceed()) {
    return;
  }

  if (
    !s.render_setts_templs.render_templs?.includes(
      s.tmpl.render_setts_templ,
    ) ||
    !s.render_setts_templs.output_modules_templs?.includes(
      s.tmpl.render_out_module_templ,
    )
  ) {
    output_hooks.Message(
      "Select valid Render Settings and Output Module templates in the Output tab before rendering.",
      "Render Settings Missing",
    );
    return;
  }

  let send_templ;
  //If just rendering a single row, clone the template and trim it down to that row
  if (row_i !== undefined && row_i !== -1) {
    send_templ = structuredClone($state.snapshot(s.tmpl));

    for (let col of send_templ.columns) {
      col.values = [col.values[row_i]];
    }
  } else {
    send_templ = s.tmpl;
  }

  TemplateHelper.ResolveCompsNames(send_templ);
  TemplateHelper.ResolveSavePaths(send_templ);
  TemplateHelper.ResolveAltSrcPaths(send_templ);

  if (row_i === -1) {
    const filtered = FilterEnabledRows(send_templ);
    if (!filtered) return;
    send_templ = filtered;
  }

  //checks for dupliate save paths
  const path_conflicts = TemplateHelper.CheckDuplicateSavePaths(
    send_templ,
    "render",
  );
  if (path_conflicts.length > 0) {
    const details = path_conflicts
      .map(
        (c) =>
          `Rows ${c.rows.map((r) => r + 1).join(", ")} (<code>${c.path}</code>)`,
      )
      .join("<br>");

    output_hooks.Message(
      `Two or more rows will render files with the same output path. After Effects will not start the queue until this is fixed.<br><br>${details}`,
      "Duplicate Output Paths Detected",
    );
    return;
  }

  out.render_results = [];

  let string_templt = JSON.stringify(send_templ);
  l.debug("String sent to csa:", string_templt);

  csa
    .Exec<BatchRenderResult>(
      "BatchRender",
      string_templt,
      s.setts.render_comps_folder,
      start_queue,
    )
    .then((result) => {
      if (!result.success) {
        l.error("Failed to batch render", result.error_obj);
        const error_msg = result.error_obj?.message ?? "Unknown render error";
        output_hooks.Message(error_msg, "Error While Batch Rendering");

        if (row_i !== -1) {
          output_hooks.Footer(
            "⚠️ Error While Queuing Row " + row_i,
            error_msg,
          );
        }
        return;
      }

      //Some errors happened, log it as a warning (default txt log file level)
      else if (result.errors !== undefined && result.errors.length > 0) {
        l.warn(`Batch Render completed with errors`, result.errors);
        out.render_results = result.row_results ?? [];

        if (row_i !== -1) {
          output_hooks.Footer(
            "⚠️ Errors While Queuing Row " + row_i,
            result.errors.map((e) => e.message).join("<br>"),
          );
        }
        return;
      }

      //All rows queued up successfully
      else {
        l.debug(`Batch Render Results`, out.render_results);
        out.render_results = result.row_results ?? [];

        if (row_i !== -1) {
          output_hooks.Footer("Render Queued Successfully");
        }
        return;
      }
    });
}

export function BatchGenerate() {
  TemplateHelper.ResolveCompsNames(s.tmpl);
  TemplateHelper.ResolveAltSrcPaths(s.tmpl);

  const send_templ = FilterEnabledRows(s.tmpl);
  if (!send_templ) return;

  let string_templt = JSON.stringify(send_templ);
  l.debug("BatchGenerate called");
  l.log("Rendering:", string_templt);

  csa
    .Exec<BatchGenerateResult>("BatchGenerate", string_templt)
    .then((result) => {
      if (!result.success) {
        l.error("Failed to batch generate", result.error_obj);
        return;
      } else {
        l.debug(`Batch Generate Started`);
      }
    });
}

export function BatchOneToMany(row_i: number = -1, queue_ame: boolean = false) {
  l.log("BatchOneToMany called");

  if (!output_hooks.CanProceed()) {
    return;
  }

  const conf_issues = s.tmpl.dep_config.filter((dc) => {
    return (
      dc.enabled &&
      (!s.render_setts_templs.render_templs?.includes(dc.render_setts_templ) ||
        !s.render_setts_templs.output_modules_templs?.includes(
          dc.render_out_module_templ,
        ))
    );
  });
  if (conf_issues.length > 0) {
    l.warn("Configuration issues detected:", conf_issues);
    let issues_s = "";
    for (let issue of conf_issues) {
      issues_s += `<li>${issue.name ?? "Unknown"}</li>`;
    }

    output_hooks.Message(
      `Select a Render Settings template and an Output Module template for every enabled composition before rendering. Issues detected in:<br><ul>${issues_s}</ul>`,
      "Render Settings Missing",
    );
    return;
  }

  let send_templ;

  //If just rendering a single row, clone the template and trim it down to that row
  if (row_i !== undefined && row_i !== -1) {
    //TODO this is a hack, find a better way to do this
    send_templ = structuredClone($state.snapshot(s.tmpl));

    for (let col of send_templ.columns) {
      col.values = [col.values[row_i]];
    }
  } else {
    send_templ = s.tmpl;
  }

  TemplateHelper.UpdateRows(send_templ);
  TemplateHelper.ResolveCompsNames(send_templ);
  TemplateHelper.ResolveAltSrcPaths(send_templ);
  TemplateHelper.ResolveSavePathDeps(send_templ);

  if (row_i === -1) {
    const filtered = FilterEnabledRows(send_templ);
    if (!filtered) return;
    send_templ = filtered;
  }

  //checks for dupliate save paths
  const dep_path_conflicts = TemplateHelper.CheckDuplicateSavePaths(
    send_templ,
    "dependant",
  );
  if (dep_path_conflicts.length > 0) {
    const details = dep_path_conflicts
      .map((c) => {
        const comp_label = c.comp_name ? `${c.comp_name}` : "";
        return `<b>${comp_label}</b> Rows with the same output: ${c.rows.map((r) => r + 1).join(", ")} (<code>${c.path}</code>)`;
      })
      .join("<br>");
    output_hooks.Message(
      `Two or more rows resolve to the same output file path. Your files will be overwritten.<br><br>${details}`,
      "Duplicate Output Paths Detected",
    );
    return;
  }

  let string_templt = JSON.stringify(send_templ);
  l.debug("OtM String Sent to csa:", string_templt);

  if (row_i !== -1) {
    output_hooks.Footer("Queuing Multi-Output Render...");
  }

  csa
    .Exec<BatchRenderResult>("BatchRenderDepComps", string_templt, queue_ame)
    .then((result) => {
      l.debug(`OtM Render Results`, result);

      if (!result.success) {
        l.error("Failed to render OtM", result.error_obj);
        const error_msg =
          result.error_obj?.message ?? "Unknown Multi-Output render error";
        output_hooks.Message(error_msg, "Error While Rendering Multi-Output");
        return;
      }

      //Some rows had errors, but the queing went through
      else if (result.errors !== undefined && result.errors.length > 0) {
        l.warn(`OtM Render completed with errors`, result.errors);
        out.dep_row_results = result.row_results ?? [];

        if (row_i !== -1) {
          output_hooks.Footer(
            "⚠️ Multi-Output Render completed with errors for Row " + row_i,
            "Check the log in the Render tab for details.",
          );
        }
      }

      //User stopped the render
      else if (result.user_stopped) {
        l.log(`OtM Render stopped by user`);
        out.user_stopped_deps = true;
        out.dep_row_results = result.row_results ?? [];
      }

      //All rows rendered successfully
      else {
        out.dep_row_results = result.row_results ?? [];

        if (row_i !== -1) {
          output_hooks.Footer("Queued Successfully");
        }
      }
    });
}
