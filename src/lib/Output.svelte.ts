import { l, s, csa } from "./States.svelte.ts";
import { TemplateHelper, type TemplateData, type Comp } from "./Settings.svelte.ts";
import type {
  BatchRenderResult,
  BatchGenerateResult,
  CheckReplacementFilesResult,
  GetAllCompsResult,
  RowRenderResult,
  RenderProgress,
  RenderQueueStatusResult,
  Result,
} from "./Messaging";
import { LocalSettings } from "./LocalSettings";
import { RunBatchPreflight, type BatchPreflightResult, type PreflightFinding } from "./BatchPreflight";

/**Callbacks the app registers so output actions can open modals and update the status footer.*/
export const output_hooks = {
  Message: (msg: string, title: string): void => {},
  PreflightIssues: (findings: PreflightFinding[], rows: number[]): void => {},
  Footer: (txt: string, long_msg = ""): void => {},
  CanProceed: (): boolean => true,
  ContinueAfterError: async (message: string): Promise<boolean> => false,
};

/**State shared between the output tab and the rest of the app (row render shortcuts, startup).*/
export const out = $state({
  /**User facing render results*/
  render_results: [] as RowRenderResult[],
  dep_row_results: [] as RowRenderResult[],
  user_stopped_deps: false,
  all_comps: [] as Comp[],
  dep_progress: null as RenderProgress | null,
  dep_running: false,
  dep_busy: false,
  project_path: null as string | null,
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
function FilterEnabledRows(tmpl: TemplateData, rows = TemplateHelper.EnabledRows(tmpl)): TemplateData | null {
  if (rows.length === 0) {
    output_hooks.Message("Check at least one row to render.", "No Rows Selected");
    return null;
  }
  if (rows.length === TemplateHelper.RowCount(tmpl)) return tmpl;
  const copy = structuredClone($state.snapshot(tmpl)) as TemplateData;
  TemplateHelper.KeepRows(copy, rows);
  return copy;
}

async function PrepareBatch(mode: "render" | "dependant", row_i: number): Promise<BatchPreflightResult | null> {
  const template = s.tmpl;
  if (template?.out_mode !== mode || out.dep_running || out.dep_busy || !output_hooks.CanProceed()) return null;
  const project_path = out.project_path;
  const IsCurrent = () => s.tmpl === template && template.out_mode === mode &&
    out.project_path === project_path && output_hooks.CanProceed();

  out.dep_busy = true;
  try {
    const result = await RunBatchPreflight($state.snapshot(template), s.render_setts_templs,
      (paths) => csa.Exec<CheckReplacementFilesResult>("CheckReplacementFiles", JSON.stringify(paths)), row_i);
    if (!IsCurrent()) return null;
    if (mode === "dependant") {
      if (HasUnfinishedDepRender()) result.findings.push({ code: "batch_in_progress" });
      if (result.rows.length) {
        try {
          // AE can report paused items even after the queue stops.
          if ((await QueueStatus()).rendering) result.findings.push({ code: "queue_active" });
        } catch (error) {
          result.findings.push({ code: "preflight_failed", message: `Could not check the render queue. ${error}` });
        }
      }
    }
    if (!IsCurrent()) return null;
    if (result.findings.length) {
      output_hooks.PreflightIssues(result.findings, result.rows);
      return null;
    }
    return result;
  } catch (error) {
    if (IsCurrent()) output_hooks.PreflightIssues([{ code: "preflight_failed", message: String(error) }], []);
    return null;
  } finally {
    out.dep_busy = false;
  }
}

export async function BatchRender(row_i: number = -1, start_queue: boolean = true) {
  l.log("BatchRender called");
  const batch = await PrepareBatch("render", row_i);
  if (!batch) return;
  const { rows, template: send_templ } = batch;

  out.render_results = [];

  let string_templt = JSON.stringify(send_templ);
  l.debug("String sent to csa:", string_templt);

  await csa
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

      out.render_results = (result.row_results ?? []).map((item) => ({
        ...item,
        row: rows[item.row],
        comp_name: item.comp_name ?? `${send_templ.name}_${item.row}`,
      }));

      //Some errors happened, log it as a warning (default txt log file level)
      if (result.errors !== undefined && result.errors.length > 0) {
        l.warn(`Batch Render completed with errors`, result.errors);

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

        if (row_i !== -1) {
          output_hooks.Footer("Render Queued Successfully");
        }
        return;
      }
    });
}

export function BatchGenerate() {
  if (out.dep_running || out.dep_busy) return;
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

export async function BatchOneToMany(row_i: number = -1, queue_ame: boolean = false) {
  l.log("BatchOneToMany called");
  const batch = await PrepareBatch("dependant", row_i);
  if (!batch) return;
  const { rows, template: send_templ } = batch;
  out.dep_progress = {
    project_path: out.project_path, comp_id: send_templ.comp_id,
    row_count: TemplateHelper.RowCount(send_templ), rows, current: 0, state: "rendering",
    results: rows.flatMap((row) => send_templ.dep_comps.flatMap((comp, i) =>
      send_templ.dep_config[i].enabled ? [{
        row, comp_id: comp.id, comp_name: comp.name, status: "pending" as const,
        rendered_path: send_templ.dep_config[i].save_paths[row],
      }] : [])),
  };
  await RunDepRows(send_templ, false, queue_ame);
}

function PrepareDepTemplate(): TemplateData {
  const tmpl = structuredClone($state.snapshot(s.tmpl));
  TemplateHelper.UpdateRows(tmpl);
  TemplateHelper.ResolveCompsNames(tmpl);
  TemplateHelper.ResolveBatchPaths(tmpl, "dependant");
  return tmpl;
}

function SaveDepProgress() {
  if (!out.dep_progress) return;
  out.dep_row_results = out.dep_progress.results;
  LocalSettings.SaveRenderProgress($state.snapshot(out.dep_progress));
  const rendered = out.dep_row_results.filter((item) => item.status === "rendered").length;
  output_hooks.Footer(`${rendered}/${out.dep_row_results.length} Outputs Rendered - ${out.dep_progress.state}`);
}

export function HasUnfinishedDepRender(): boolean {
  const progress = out.dep_progress;
  return !!progress && progress.project_path === out.project_path &&
    progress.current < progress.rows.length;
}

export function CanContinueDepRender(): boolean {
  const progress = out.dep_progress;
  return !!progress && HasUnfinishedDepRender() && progress.comp_id === s.tmpl?.comp_id &&
    progress.row_count === TemplateHelper.RowCount(s.tmpl);
}

function ResetDepRender() {
  LocalSettings.ClearRenderProgress();
  StopDepPolling();
  out.dep_progress = null;
  out.dep_row_results = [];
  out.user_stopped_deps = false;
  output_hooks.Footer("Batch stopped. Start a new batch to render from the beginning.");
}

export function RestoreDepRender(project_path: string | null) {
  if (out.project_path !== project_path) StopDepPolling();
  out.project_path = project_path;
  try {
    const progress = LocalSettings.LoadRenderProgress();
    out.dep_progress = progress?.project_path === project_path ? progress : null;
    out.dep_row_results = out.dep_progress?.results ?? [];
    out.user_stopped_deps = out.dep_progress?.state === "stopped";
  } catch (error) {
    l.error("Could not restore render progress", error);
    output_hooks.Message(String(error), "Could Not Restore Render Progress");
  }
}

let dep_poll_token = 0;
let dep_task: Promise<void> | null = null;

export function StopDepPolling() {
  dep_poll_token++;
  out.dep_running = false;
}

async function QueueStatus(): Promise<RenderQueueStatusResult> {
  const result = await csa.Exec<RenderQueueStatusResult>("GetRenderQueueStatus");
  if (!result.success) throw new Error(result.error_obj?.message ?? "Could not read the render queue.");
  if (!Array.isArray(result.items) || typeof result.rendering !== "boolean") {
    throw new Error("Invalid render queue status.");
  }
  return result;
}

async function QueueControl(action: "pause" | "continue" | "stop" | "start" | "reset_after_stop") {
  const result = await csa.Exec<Result>("ControlRenderQueue", action);
  if (!result.success) throw new Error(result.error_obj?.message ?? "Could not control the render queue.");
}

async function StopDepQueue(progress: RenderProgress) {
  let queue = await QueueStatus();
  const owned = queue.items.filter((item) => progress.results.some((result) =>
    result.row === progress.rows[progress.current] && result.queue_index === item.index &&
    result.comp_id === item.comp_id && result.rendered_path === item.path));
  if (!owned.length) return;

  if (queue.rendering) {
    const active = queue.items.filter((item) => item.status === "rendering" || item.status === "paused");
    const candidates = active.length ? active : queue.items.filter((item) => item.status === "queued");
    if (!candidates.length || !candidates.every((item) => owned.includes(item))) return;
    await QueueControl("stop");
    //After Effects can acknowledge Stop before the renderer actually stops.
    const deadline = Date.now() + 5000;
    do {
      queue = await QueueStatus();
      if (!queue.rendering) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    if (queue.rendering) throw new Error("After Effects has not stopped the render yet. Try Stop Batch again.");
  }
  await QueueControl("reset_after_stop");
}

function UpdateDepResults(queue: RenderQueueStatusResult) {
  const progress = out.dep_progress!;
  for (const result of progress.results) {
    if (result.row !== progress.rows[progress.current] || result.queue_index === undefined) continue;
    const item = queue.items.find((item) => item.index === result.queue_index &&
      item.comp_id === result.comp_id && item.path === result.rendered_path);
    if (!item) throw new Error("The current row's render queue items are no longer available.");
    if (item.status === "unqueued" || item.status === "needs_output") {
      throw new Error("An output is not ready to render: " + result.comp_name);
    }
    result.status = item.status === "paused" ? "rendering" : item.status;
    if (item.status === "error") result.error = "After Effects stopped this output with an error.";
    if (item.status === "stopped") result.error = "Render stopped by user.";
  }
}

function ConfirmDepErrors(errors: RowRenderResult[]): Promise<boolean> {
  const messages = new Set(errors.map((item) => item.error || "An output could not be rendered."));
  return output_hooks.ContinueAfterError([...messages].join("\n"));
}

function IsPausedRenderError(message?: string): boolean {
  return /render\(\) may not be called while rendering is paused/i.test(message ?? "");
}

/**Waits for the current row only. Queue inactivity alone is not completion.*/
async function WaitDepRow(token: number, acknowledged: Set<number>): Promise<boolean> {
  const progress = out.dep_progress!;
  let started_at = Date.now();
  while (out.dep_running && token === dep_poll_token) {
    const current_results = progress.results.filter((item) => item.row === progress.rows[progress.current]);
    if (!current_results.some((item) => item.queue_index !== undefined)) return true;
    const queue = await QueueStatus();
    if (!out.dep_running || token !== dep_poll_token) return false;
    UpdateDepResults(queue);
    if (current_results.some((item) => item.status === "stopped")) {
      progress.state = "stopped";
      SaveDepProgress();
      return false;
    }
    if (queue.rendering && queue.items.some((item) => item.status === "paused")) {
      progress.state = "paused_now";
      SaveDepProgress();
      return false;
    }
    const errors = current_results.filter((item) => item.status === "error" && !acknowledged.has(item.comp_id!));
    const pending = current_results.some((item) => item.status === "queued" || item.status === "rendering");
    SaveDepProgress();
    if (!queue.rendering && !pending) return true;
    if (!queue.rendering && errors.length) {
      const proceed = await ConfirmDepErrors(errors);
      if (!out.dep_running || token !== dep_poll_token) return false;
      if (!proceed) {
        await StopDepQueue(progress);
        ResetDepRender();
        return false;
      }
      errors.forEach((item) => acknowledged.add(item.comp_id!));
      await QueueControl("start");
      started_at = Date.now();
    } else if (!queue.rendering && Date.now() - started_at > 10000) {
      throw new Error("After Effects has not started the queued outputs. Stop the batch or try Continue.");
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return false;
}

async function RunDepRows(tmpl: TemplateData, observe_current: boolean, queue_ame = false) {
  if (dep_task) return;
  const progress = out.dep_progress!;
  const token = ++dep_poll_token;
  out.dep_running = true;
  out.user_stopped_deps = false;
  dep_task = (async () => {
    try {
      while (out.dep_running && token === dep_poll_token && CanContinueDepRender()) {
        const row = progress.rows[progress.current];
        if (!observe_current) {
          progress.results = progress.results.map((item) => item.row !== row ? item :
            {...item, status: "pending", queue_index: undefined, error: undefined});
          progress.state = "rendering";
          SaveDepProgress();
          const row_template = {
            comp_id: tmpl.comp_id,
            imported_footage_folder: tmpl.imported_footage_folder,
            columns: tmpl.columns.map((col) => ({...col, values: [col.values[row]]})),
            dep_comps: tmpl.dep_comps,
            dep_config: tmpl.dep_config.map((config) => ({...config, save_paths: [config.save_paths[row]]})),
          };
          const result = await csa.Exec<BatchRenderResult>("BatchRenderDepComps",
            JSON.stringify(row_template), queue_ame);
          if (token !== dep_poll_token) return;
          progress.results = progress.results.map((item) => {
            if (item.row !== row) return item;
            const rendered = result.row_results?.find((output) => output.comp_id === item.comp_id);
            return rendered ? {...rendered, row} :
              {...item, status: "error", error: result.error_obj?.message ?? "Output could not be prepared."};
          });
          if (!result.success && IsPausedRenderError(result.error_obj?.message)) {
            throw new Error(result.error_obj?.message);
          }
          if (!result.success) l.error("Could not render row", result.error_obj);
          SaveDepProgress();
        }
        observe_current = false;
        const acknowledged = new Set<number>();
        if (!queue_ame && !await WaitDepRow(token, acknowledged)) break;
        if (!out.dep_running || token !== dep_poll_token) return;
        const errors = progress.results.filter((item) =>
          item.row === row && item.status === "error" && !acknowledged.has(item.comp_id!));
        const proceed = !errors.length || await ConfirmDepErrors(errors);
        if (!out.dep_running || token !== dep_poll_token) return;
        if (!proceed) {
          await StopDepQueue(progress);
          ResetDepRender();
          return;
        }
        progress.current++;
        if (progress.current === progress.rows.length) progress.state = "completed";
        SaveDepProgress();
      }
    } catch (error) {
      if (token === dep_poll_token) {
        progress.state = "error";
        l.error("Multi Output rendering interrupted", error);
        const message = String(error);
        output_hooks.Message(IsPausedRenderError(message)
          ? "After Effects could not start this row. Click Continue to try again, or Stop Batch to start over."
          : message, "Multi-Output Render Interrupted");
      }
    } finally {
      if (token === dep_poll_token) {
        out.dep_running = false;
        out.user_stopped_deps = progress.state === "stopped";
        try { SaveDepProgress(); } catch (error) {
          l.error("Could not save render progress", error);
          output_hooks.Message(String(error), "Could Not Save Render Progress");
        }
      }
    }
  })();
  try { await dep_task; } finally { dep_task = null; }
}

export async function PauseDepRender() {
  if (!out.dep_running || !out.dep_progress || out.dep_busy) return;
  out.dep_busy = true;
  try {
    out.dep_running = false;
    if ((await QueueStatus()).rendering) await QueueControl("pause");
    out.dep_progress.state = "paused_now";
    await dep_task;
    SaveDepProgress();
  } catch (error) {
    l.error("Could not pause render", error);
    output_hooks.Message(String(error), "Could Not Pause Render");
  } finally { out.dep_busy = false; }
}

export async function StopDepRender() {
  const progress = out.dep_progress;
  if (!progress || !HasUnfinishedDepRender() || out.dep_busy) return;
  out.dep_busy = true;
  out.dep_running = false;
  try {
    await dep_task;
    await StopDepQueue(progress);
    ResetDepRender();
  } catch (error) {
    l.error("Could not stop render", error);
    output_hooks.Message(String(error), "Could Not Stop Render");
  } finally { out.dep_busy = false; }
}

export async function ContinueDepRender() {
  if (!CanContinueDepRender() || out.dep_running || out.dep_busy || dep_task) return;
  out.dep_busy = true;
  try {
    const progress = out.dep_progress!;
    const queue = await QueueStatus();
    const current_results = progress.results.filter((item) => item.row === progress.rows[progress.current]);
    const queue_paused = queue.items.some((item) => item.status === "paused");
    const observe_current = queue.rendering;
    if (observe_current) {
      if (!current_results.some((item) => item.queue_index !== undefined)) {
        throw new Error("Wait for the active render queue to finish before continuing this batch.");
      }
      UpdateDepResults(queue);
      if (progress.state === "paused_now" || queue_paused) {
        await QueueControl("continue");
      }
    } else if (current_results.some((item) => item.queue_index !== undefined)) {
      const finished = current_results.every((result) => result.status === "rendered" ||
        queue.items.some((item) => item.index === result.queue_index &&
          item.comp_id === result.comp_id && item.path === result.rendered_path && item.status === "rendered"));
      if (finished) {
        UpdateDepResults(queue);
        progress.current++;
      }
    } else if (current_results.every((item) => item.status === "rendered")) {
      progress.current++;
    }
    progress.state = progress.current === progress.rows.length ? "completed" : "rendering";
    SaveDepProgress();
    if (progress.state !== "completed") void RunDepRows(PrepareDepTemplate(), observe_current);
  } catch (error) {
    l.error("Could not continue render", error);
    output_hooks.Message(String(error), "Could Not Continue Render");
  } finally { out.dep_busy = false; }
}
