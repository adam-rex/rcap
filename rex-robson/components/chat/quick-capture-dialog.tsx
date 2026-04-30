"use client";

import {
  FileText,
  Mail,
  Mic,
  MicOff,
  Pencil,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { INTERNAL_CONTACT_OWNERS } from "@/lib/constants/internal-contact-owners";
import type { WorkspaceOrganisationPageRow } from "@/lib/data/workspace-organisations-page.types";
import { WORKSPACE_ORGANISATIONS_PAGE_SIZE_MAX } from "@/lib/data/workspace-organisations-page.types";
import type { QuickCaptureDraft } from "@/lib/prompts/quick-capture";
import {
  WORKSPACE_FORM_BTN_PRIMARY,
  WORKSPACE_FORM_BTN_SECONDARY,
  WORKSPACE_FORM_INPUT_CLASS,
  WORKSPACE_FORM_LABEL_CLASS,
  WorkspaceCreateDialog,
} from "./workspace-create-dialog";

const CONTACT_TYPE_OPTIONS = [
  "Founder",
  "Investor",
  "Lender",
  "Advisor",
  "Corporate",
  "Other",
] as const;

const UPLOAD_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif,application/pdf,.pdf";

const EMAIL_UPLOAD_ACCEPT = ".eml,message/rfc822";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_EML_BYTES = 25 * 1024 * 1024;

const MAX_VOICE_SECONDS = 120;

const ORG_NEW_VALUE = "__new__";
const ORG_NONE_VALUE = "";

type Mode = "text" | "voice" | "upload" | "email";

type Phase =
  | "compose"
  | "extracting"
  | "review"
  | "saving"
  | "saved"
  | "email_saved";

type EmailIngestSummary = {
  emailId: string;
  extractionsCount: number;
  attachmentsCount: number;
  dedup: boolean;
};

export type QuickCaptureMatchRow = {
  suggestionId: string | null;
  title: string;
  reasons: string[];
  counterpartyId: string;
  counterpartyName: string;
  counterpartySide: "founder" | "investor" | "lender";
  score: number;
};

export type QuickCaptureSuccess = {
  contactId: string;
  name: string;
  matches: QuickCaptureMatchRow[];
};

type QuickCaptureDialogProps = {
  open: boolean;
  onClose: () => void;
  onCaptured?: (success: QuickCaptureSuccess) => void;
  onOpenSuggestions?: () => void;
  onOpenEmail?: (emailId: string) => void;
};

type ReviewForm = {
  name: string;
  contactType: string;
  sector: string;
  internalOwner: string;
  organisationChoice: string;
  inlineOrgName: string;
  inlineOrgType: string;
  inlineOrgDescription: string;
  role: string;
  geography: string;
  phone: string;
  email: string;
  notes: string;
  lowConfidence: string[];
  rexSummary: string;
};

function emptyForm(): ReviewForm {
  return {
    name: "",
    contactType: "",
    sector: "",
    internalOwner: INTERNAL_CONTACT_OWNERS[0],
    organisationChoice: ORG_NONE_VALUE,
    inlineOrgName: "",
    inlineOrgType: "",
    inlineOrgDescription: "",
    role: "",
    geography: "",
    phone: "",
    email: "",
    notes: "",
    lowConfidence: [],
    rexSummary: "",
  };
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function pickBestRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

export function QuickCaptureDialog({
  open,
  onClose,
  onCaptured,
  onOpenSuggestions,
  onOpenEmail,
}: QuickCaptureDialogProps) {
  const [mode, setMode] = useState<Mode>("text");
  const [phase, setPhase] = useState<Phase>("compose");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ReviewForm>(() => emptyForm());

  const [textInput, setTextInput] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const uploadInputId = useId();
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const [emlFile, setEmlFile] = useState<File | null>(null);
  const [emailRawText, setEmailRawText] = useState("");
  const [emailDragActive, setEmailDragActive] = useState(false);
  const emailInputId = useId();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [emailIngest, setEmailIngest] = useState<EmailIngestSummary | null>(null);

  const [recordingState, setRecordingState] = useState<
    "idle" | "recording" | "stopped" | "transcribing"
  >("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderTimerRef = useRef<number | null>(null);

  const [saved, setSaved] = useState<QuickCaptureSuccess | null>(null);

  const [orgOptions, setOrgOptions] = useState<WorkspaceOrganisationPageRow[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);

  const stopRecorderTimer = useCallback(() => {
    if (recorderTimerRef.current != null) {
      window.clearInterval(recorderTimerRef.current);
      recorderTimerRef.current = null;
    }
  }, []);

  const releaseRecorder = useCallback(() => {
    stopRecorderTimer();
    const stream = recorderStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    recorderStreamRef.current = null;
    recorderRef.current = null;
  }, [stopRecorderTimer]);

  const resetAll = useCallback(() => {
    setMode("text");
    setPhase("compose");
    setError(null);
    setTextInput("");
    setUploadFiles([]);
    setTranscript("");
    setRecordingState("idle");
    setRecordingSeconds(0);
    setForm(emptyForm());
    setSaved(null);
    setEmlFile(null);
    setEmailRawText("");
    setEmailDragActive(false);
    setEmailIngest(null);
    if (emailInputRef.current) emailInputRef.current.value = "";
    releaseRecorder();
  }, [releaseRecorder]);

  useEffect(() => {
    if (!open) {
      resetAll();
    }
  }, [open, resetAll]);

  useEffect(() => {
    if (!open || phase !== "review") return;
    let cancelled = false;
    (async () => {
      setOrgsLoading(true);
      try {
        const res = await fetch(
          `/api/workspace/organisations?page=1&pageSize=${WORKSPACE_ORGANISATIONS_PAGE_SIZE_MAX}`,
        );
        const data = (await res.json()) as {
          rows?: WorkspaceOrganisationPageRow[];
        };
        if (!cancelled && res.ok) {
          setOrgOptions(data.rows ?? []);
        }
      } catch {
        if (!cancelled) setOrgOptions([]);
      } finally {
        if (!cancelled) setOrgsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, phase]);

  const lowConfSet = useMemo(
    () => new Set(form.lowConfidence),
    [form.lowConfidence],
  );

  const applyDraft = useCallback(
    (draft: QuickCaptureDraft, fallbackNotes: string) => {
      const matchedOrg = draft.organisationName
        ? orgOptions.find(
            (o) =>
              o.name.trim().toLowerCase() ===
              draft.organisationName.trim().toLowerCase(),
          )
        : undefined;
      setForm({
        name: draft.name,
        contactType: draft.contactType || "",
        sector: draft.sector,
        internalOwner: INTERNAL_CONTACT_OWNERS[0],
        organisationChoice: matchedOrg
          ? matchedOrg.id
          : draft.organisationName
            ? ORG_NEW_VALUE
            : ORG_NONE_VALUE,
        inlineOrgName: matchedOrg ? "" : draft.organisationName,
        inlineOrgType: "",
        inlineOrgDescription: "",
        role: draft.role,
        geography: draft.geography,
        phone: draft.phone,
        email: draft.email,
        notes: draft.notes || fallbackNotes,
        lowConfidence: draft.lowConfidence,
        rexSummary: draft.rexSummary,
      });
    },
    [orgOptions],
  );

  const submitExtraction = useCallback(
    async (input:
      | { kind: "text"; text: string }
      | { kind: "upload"; text: string; files: File[] }) => {
      setPhase("extracting");
      setError(null);
      try {
        let res: Response;
        if (input.kind === "text") {
          res = await fetch("/api/rex/capture", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: input.text }),
          });
        } else {
          const fd = new FormData();
          if (input.text.trim()) fd.append("text", input.text);
          for (const f of input.files) fd.append("documents", f, f.name);
          res = await fetch("/api/rex/capture", {
            method: "POST",
            body: fd,
          });
        }
        const data = (await res.json()) as {
          draft?: QuickCaptureDraft;
          error?: string;
        };
        if (!res.ok || !data.draft) {
          setPhase("compose");
          setError(data.error ?? "Rex couldn't read that. Try again.");
          return;
        }
        applyDraft(data.draft, input.kind === "text" ? input.text : "");
        setPhase("review");
      } catch {
        setPhase("compose");
        setError("Network error while extracting. Try again.");
      }
    },
    [applyDraft],
  );

  const onSubmitText = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = textInput.trim();
      if (trimmed.length < 3) {
        setError("Add a few more details so Rex has something to work with.");
        return;
      }
      await submitExtraction({ kind: "text", text: trimmed });
    },
    [textInput, submitExtraction],
  );

  const onSubmitUpload = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (uploadFiles.length === 0) {
        setError("Attach a photo or PDF first.");
        return;
      }
      await submitExtraction({
        kind: "upload",
        text: textInput.trim(),
        files: uploadFiles,
      });
    },
    [uploadFiles, textInput, submitExtraction],
  );

  const addUploadFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    const next: File[] = [];
    const rejected: string[] = [];
    for (let i = 0; i < list.length; i += 1) {
      const f = list.item(i);
      if (!f) continue;
      if (f.size > MAX_UPLOAD_BYTES) {
        rejected.push(`${f.name} (too large)`);
        continue;
      }
      const lower = f.name.toLowerCase();
      const ok =
        f.type.startsWith("image/") ||
        f.type === "application/pdf" ||
        lower.endsWith(".jpg") ||
        lower.endsWith(".jpeg") ||
        lower.endsWith(".png") ||
        lower.endsWith(".webp") ||
        lower.endsWith(".gif") ||
        lower.endsWith(".pdf");
      if (!ok) {
        rejected.push(`${f.name} (unsupported)`);
        continue;
      }
      next.push(f);
    }
    setUploadFiles((prev) => [...prev, ...next]);
    setError(
      rejected.length > 0 ? `Skipped: ${rejected.join(", ")}` : null,
    );
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      addUploadFiles(e.dataTransfer.files);
    },
    [addUploadFiles],
  );

  const removeUploadFile = useCallback((index: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const acceptEmlFile = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    const f = list.item(0);
    if (!f) return;
    const lower = f.name.toLowerCase();
    const ok =
      lower.endsWith(".eml") ||
      f.type === "message/rfc822" ||
      f.type === "application/octet-stream";
    if (!ok) {
      setError(`Unsupported file: ${f.name}. Drop a .eml export.`);
      return;
    }
    if (f.size > MAX_EML_BYTES) {
      setError(`${f.name} is too large (limit 25 MB).`);
      return;
    }
    setError(null);
    setEmlFile(f);
    if (emailInputRef.current) emailInputRef.current.value = "";
  }, []);

  const onEmailDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setEmailDragActive(false);
      acceptEmlFile(e.dataTransfer.files);
    },
    [acceptEmlFile],
  );

  const submitEmailIngest = useCallback(async () => {
    setPhase("extracting");
    setError(null);
    try {
      let res: Response;
      if (emlFile) {
        const fd = new FormData();
        fd.append("eml", emlFile, emlFile.name);
        res = await fetch("/api/rex/email/ingest", { method: "POST", body: fd });
      } else {
        const trimmed = emailRawText.trim();
        if (!trimmed) {
          setPhase("compose");
          setError("Drop a .eml file or paste a forwarded email first.");
          return;
        }
        res = await fetch("/api/rex/email/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawText: trimmed }),
        });
      }
      const data = (await res.json()) as {
        ok?: boolean;
        emailId?: string;
        extractionsCount?: number;
        attachmentsCount?: number;
        dedup?: boolean;
        error?: string;
      };
      if (!res.ok || !data.emailId) {
        setPhase("compose");
        setError(data.error ?? "Rex couldn't read that email. Try again.");
        return;
      }
      setEmailIngest({
        emailId: data.emailId,
        extractionsCount: data.extractionsCount ?? 0,
        attachmentsCount: data.attachmentsCount ?? 0,
        dedup: !!data.dedup,
      });
      setPhase("email_saved");
    } catch {
      setPhase("compose");
      setError("Network error while ingesting email.");
    }
  }, [emlFile, emailRawText]);

  const onSubmitEmail = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!emlFile && emailRawText.trim().length < 10) {
        setError("Drop a .eml file or paste the forwarded email body.");
        return;
      }
      await submitEmailIngest();
    },
    [emlFile, emailRawText, submitEmailIngest],
  );

  const startRecording = useCallback(async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setError("Voice recording isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      recorderStreamRef.current = stream;
      const mimeType = pickBestRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorderChunksRef.current = [];

      recorder.addEventListener("dataavailable", (ev) => {
        if (ev.data && ev.data.size > 0) {
          recorderChunksRef.current.push(ev.data);
        }
      });

      recorder.addEventListener("stop", () => {
        stopRecorderTimer();
        const stream = recorderStreamRef.current;
        if (stream) {
          for (const track of stream.getTracks()) track.stop();
        }
        recorderStreamRef.current = null;
        setRecordingState("stopped");
      });

      recorder.start();
      setRecordingState("recording");
      setRecordingSeconds(0);
      recorderTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => {
          const next = s + 1;
          if (next >= MAX_VOICE_SECONDS) {
            try {
              recorder.stop();
            } catch {
              /* ignore */
            }
          }
          return next;
        });
      }, 1000);
    } catch (e) {
      releaseRecorder();
      const message =
        e instanceof Error ? e.message : "Microphone permission denied";
      setError(message);
      setRecordingState("idle");
    }
  }, [releaseRecorder, stopRecorderTimer]);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const discardRecording = useCallback(() => {
    recorderChunksRef.current = [];
    setRecordingState("idle");
    setRecordingSeconds(0);
    setTranscript("");
  }, []);

  const transcribeRecording = useCallback(async () => {
    if (recorderChunksRef.current.length === 0) {
      setError("No audio captured — try recording again.");
      return;
    }
    setRecordingState("transcribing");
    setError(null);
    try {
      const firstType =
        recorderChunksRef.current[0]?.type || "audio/webm";
      const blob = new Blob(recorderChunksRef.current, { type: firstType });
      const ext = firstType.includes("mp4")
        ? "m4a"
        : firstType.includes("ogg")
          ? "ogg"
          : firstType.includes("wav")
            ? "wav"
            : "webm";
      const fd = new FormData();
      fd.append("audio", blob, `voice-note.${ext}`);
      const res = await fetch("/api/rex/capture/transcribe", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { transcript?: string; error?: string };
      if (!res.ok || !data.transcript) {
        setRecordingState("stopped");
        setError(data.error ?? "Couldn't transcribe that. Try again.");
        return;
      }
      setTranscript(data.transcript);
      setRecordingState("idle");
      await submitExtraction({ kind: "text", text: data.transcript });
    } catch {
      setRecordingState("stopped");
      setError("Network error while transcribing.");
    }
  }, [submitExtraction]);

  useEffect(() => () => releaseRecorder(), [releaseRecorder]);

  const onSaveContact = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!form.name.trim()) {
        setError("Name is required.");
        return;
      }
      if (!form.contactType.trim()) {
        setError("Select a contact type.");
        return;
      }
      if (!form.sector.trim()) {
        setError("Sector is required.");
        return;
      }

      setPhase("saving");

      let organisationId: string | null = null;
      if (form.organisationChoice === ORG_NEW_VALUE) {
        const orgName = form.inlineOrgName.trim();
        if (!orgName) {
          setPhase("review");
          setError("Enter a name for the new organisation.");
          return;
        }
        try {
          const orgRes = await fetch("/api/workspace/organisations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: orgName,
              type:
                form.inlineOrgType.trim() === ""
                  ? null
                  : form.inlineOrgType.trim(),
              description:
                form.inlineOrgDescription.trim() === ""
                  ? null
                  : form.inlineOrgDescription.trim(),
            }),
          });
          const orgData = (await orgRes.json()) as {
            id?: string;
            error?: string;
          };
          if (!orgRes.ok || typeof orgData.id !== "string") {
            setPhase("review");
            setError(orgData.error ?? "Could not create organisation.");
            return;
          }
          organisationId = orgData.id;
        } catch {
          setPhase("review");
          setError("Network error while creating organisation.");
          return;
        }
      } else if (form.organisationChoice !== ORG_NONE_VALUE) {
        organisationId = form.organisationChoice;
      }

      let contactId: string;
      try {
        const res = await fetch("/api/workspace/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            contactType: form.contactType,
            sector: form.sector.trim(),
            organisationId,
            role: form.role.trim() === "" ? null : form.role.trim(),
            geography:
              form.geography.trim() === "" ? null : form.geography.trim(),
            phone: form.phone.trim() === "" ? null : form.phone.trim(),
            email: form.email.trim() === "" ? null : form.email.trim(),
            notes: form.notes.trim() === "" ? null : form.notes.trim(),
            internalOwner: form.internalOwner,
          }),
        });
        const data = (await res.json()) as {
          id?: string;
          error?: string;
          hint?: string;
        };
        if (!res.ok || typeof data.id !== "string") {
          setPhase("review");
          const parts = [data.error, data.hint].filter(
            (x): x is string => typeof x === "string" && x.length > 0,
          );
          setError(parts.length > 0 ? parts.join(" ") : "Could not save.");
          return;
        }
        contactId = data.id;
      } catch {
        setPhase("review");
        setError("Network error while saving contact.");
        return;
      }

      let matches: QuickCaptureMatchRow[] = [];
      try {
        const matchRes = await fetch("/api/rex/capture/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId, limit: 3 }),
        });
        const matchData = (await matchRes.json()) as {
          matches?: QuickCaptureMatchRow[];
          error?: string;
        };
        if (matchRes.ok && Array.isArray(matchData.matches)) {
          matches = matchData.matches;
        }
      } catch {
        matches = [];
      }

      const success: QuickCaptureSuccess = {
        contactId,
        name: form.name.trim(),
        matches,
      };
      setSaved(success);
      setPhase("saved");
      onCaptured?.(success);
    },
    [form, onCaptured],
  );

  const headerTitle =
    phase === "saved"
      ? "Saved"
      : phase === "email_saved"
        ? "Email captured"
        : phase === "review"
          ? "Review & save"
          : "Quick Capture";

  return (
    <WorkspaceCreateDialog
      open={open}
      title={headerTitle}
      onClose={onClose}
      fillMobileViewport={phase === "review" || phase === "saving"}
    >
      {phase === "compose" ? (
        <div className="p-4 sm:p-5">
          <p className="mb-4 text-sm text-charcoal-light">
            Just met someone? Tell Rex about them.
          </p>
          <ModeTabs active={mode} onChange={setMode} />

          {mode === "text" ? (
            <form onSubmit={onSubmitText} className="mt-4 space-y-3">
              <label className="sr-only" htmlFor="qc-text">
                Note about the person
              </label>
              <textarea
                id="qc-text"
                autoFocus
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                rows={6}
                placeholder="Met Jane at the fintech mixer in London — she's founding a B2B payments startup, raising a £2m seed, looking for early-stage VCs. Email: jane@acme.io."
                className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y text-[15px] leading-relaxed`}
              />
              {error ? (
                <p className="text-sm text-red-700/90" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className={WORKSPACE_FORM_BTN_SECONDARY}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={WORKSPACE_FORM_BTN_PRIMARY}
                  disabled={textInput.trim().length < 3}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="size-3.5" aria-hidden />
                    Extract with Rex
                  </span>
                </button>
              </div>
            </form>
          ) : null}

          {mode === "voice" ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-charcoal/10 bg-cream-light/40 px-4 py-6 text-center">
                {recordingState === "idle" || recordingState === "transcribing" ? (
                  <button
                    type="button"
                    onClick={
                      recordingState === "transcribing"
                        ? undefined
                        : startRecording
                    }
                    disabled={recordingState === "transcribing"}
                    className="flex size-16 items-center justify-center rounded-full bg-charcoal text-cream transition-colors enabled:hover:bg-charcoal/90 disabled:opacity-60"
                    aria-label="Start recording"
                  >
                    <Mic className="size-6" strokeWidth={1.75} aria-hidden />
                  </button>
                ) : null}
                {recordingState === "recording" ? (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex size-16 items-center justify-center rounded-full bg-red-600 text-cream transition-colors hover:bg-red-700"
                    aria-label="Stop recording"
                  >
                    <MicOff className="size-6" strokeWidth={1.75} aria-hidden />
                  </button>
                ) : null}
                <p className="font-serif text-xl tracking-tight text-charcoal">
                  {recordingState === "recording"
                    ? formatSeconds(recordingSeconds)
                    : recordingState === "stopped"
                      ? `${formatSeconds(recordingSeconds)} captured`
                      : recordingState === "transcribing"
                        ? "Transcribing…"
                        : "Tap to record"}
                </p>
                <p className="text-xs text-charcoal-light/80">
                  {recordingState === "recording"
                    ? `Max ${MAX_VOICE_SECONDS}s. Say name, firm, sector, what they're looking for.`
                    : recordingState === "stopped"
                      ? "Send it to Rex to transcribe, then review."
                      : recordingState === "transcribing"
                        ? "Rex is listening — this takes a few seconds."
                        : "Name, firm, sector, what they're working on."}
                </p>
              </div>

              {transcript ? (
                <div className="rounded-xl border border-charcoal/10 bg-cream-light/40 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-charcoal-light/80">
                    Transcript
                  </p>
                  <p className="mt-1 text-sm text-charcoal whitespace-pre-wrap">
                    {transcript}
                  </p>
                </div>
              ) : null}

              {error ? (
                <p className="text-sm text-red-700/90" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                {recordingState === "stopped" ? (
                  <button
                    type="button"
                    onClick={discardRecording}
                    className={WORKSPACE_FORM_BTN_SECONDARY}
                  >
                    Discard
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className={WORKSPACE_FORM_BTN_SECONDARY}
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={transcribeRecording}
                  disabled={recordingState !== "stopped"}
                  className={WORKSPACE_FORM_BTN_PRIMARY}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="size-3.5" aria-hidden />
                    Transcribe & extract
                  </span>
                </button>
              </div>
            </div>
          ) : null}

          {mode === "upload" ? (
            <form onSubmit={onSubmitUpload} className="mt-4 space-y-3">
              <label
                htmlFor={uploadInputId}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
                className={
                  "flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors " +
                  (dragActive
                    ? "border-charcoal/35 bg-charcoal/[0.04]"
                    : "border-charcoal/20 bg-cream/80 hover:border-charcoal/30")
                }
              >
                <Upload
                  className="size-8 text-charcoal-light/70"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span className="mt-3 text-sm font-semibold text-charcoal">
                  Drop a business card, email sig, or CV
                </span>
                <span className="mt-1 text-xs text-charcoal-light">
                  Photo (JPG/PNG) or PDF. Rex reads it and extracts the contact.
                </span>
                <input
                  ref={uploadInputRef}
                  id={uploadInputId}
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  multiple
                  className="sr-only"
                  onChange={(e) => addUploadFiles(e.target.files)}
                />
              </label>

              {uploadFiles.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {uploadFiles.map((f, i) => (
                    <li
                      key={`${f.name}:${f.size}:${i}`}
                      className="flex items-center gap-2 rounded-lg border border-charcoal/10 bg-cream-light/40 px-3 py-2"
                    >
                      <FileText
                        className="size-4 shrink-0 text-charcoal-light"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-charcoal">
                        {f.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeUploadFile(i)}
                        className="flex size-6 items-center justify-center rounded-full text-charcoal-light hover:bg-charcoal/10 hover:text-charcoal"
                        aria-label={`Remove ${f.name}`}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <label className="sr-only" htmlFor="qc-upload-note">
                Optional note
              </label>
              <textarea
                id="qc-upload-note"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                rows={2}
                placeholder="Optional: anything the file won't show (where you met, what they're looking for)."
                className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
              />

              {error ? (
                <p className="text-sm text-red-700/90" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className={WORKSPACE_FORM_BTN_SECONDARY}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={WORKSPACE_FORM_BTN_PRIMARY}
                  disabled={uploadFiles.length === 0}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="size-3.5" aria-hidden />
                    Extract with Rex
                  </span>
                </button>
              </div>
            </form>
          ) : null}

          {mode === "email" ? (
            <form onSubmit={onSubmitEmail} className="mt-4 space-y-3">
              <p className="text-xs text-charcoal-light/80">
                Drop a saved <span className="font-mono">.eml</span> file (forward
                the email to yourself, then save it from your mail client) or paste
                the raw forwarded text. Rex picks out the people, orgs, and any
                intro asks for you to review.
              </p>
              <label
                htmlFor={emailInputId}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setEmailDragActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setEmailDragActive(true);
                }}
                onDragLeave={() => setEmailDragActive(false)}
                onDrop={onEmailDrop}
                className={
                  "flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors " +
                  (emailDragActive
                    ? "border-charcoal/35 bg-charcoal/[0.04]"
                    : "border-charcoal/20 bg-cream/80 hover:border-charcoal/30")
                }
              >
                <Mail
                  className="size-8 text-charcoal-light/70"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span className="mt-3 text-sm font-semibold text-charcoal">
                  Drop a .eml file
                </span>
                <span className="mt-1 text-xs text-charcoal-light">
                  Up to 25 MB. Includes attachments.
                </span>
                <input
                  ref={emailInputRef}
                  id={emailInputId}
                  type="file"
                  accept={EMAIL_UPLOAD_ACCEPT}
                  className="sr-only"
                  onChange={(e) => acceptEmlFile(e.target.files)}
                />
              </label>

              {emlFile ? (
                <div className="flex items-center gap-2 rounded-lg border border-charcoal/10 bg-cream-light/40 px-3 py-2">
                  <FileText
                    className="size-4 shrink-0 text-charcoal-light"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-charcoal">
                    {emlFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEmlFile(null);
                      if (emailInputRef.current) {
                        emailInputRef.current.value = "";
                      }
                    }}
                    className="flex size-6 items-center justify-center rounded-full text-charcoal-light hover:bg-charcoal/10 hover:text-charcoal"
                    aria-label={`Remove ${emlFile.name}`}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
              ) : null}

              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-charcoal-light/70">
                <span className="h-px flex-1 bg-charcoal/10" />
                or paste raw email
                <span className="h-px flex-1 bg-charcoal/10" />
              </div>

              <label className="sr-only" htmlFor="qc-email-raw">
                Paste forwarded email
              </label>
              <textarea
                id="qc-email-raw"
                value={emailRawText}
                onChange={(e) => setEmailRawText(e.target.value)}
                rows={6}
                placeholder="From: jane@acme.io\nSubject: Intro to our portfolio\n\nHi Rex, meet Jane — she runs Acme..."
                className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y font-mono text-[13px] leading-relaxed`}
                disabled={!!emlFile}
              />

              {error ? (
                <p className="text-sm text-red-700/90" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className={WORKSPACE_FORM_BTN_SECONDARY}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={WORKSPACE_FORM_BTN_PRIMARY}
                  disabled={!emlFile && emailRawText.trim().length < 10}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="size-3.5" aria-hidden />
                    Hand to Rex
                  </span>
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      {phase === "extracting" ? (
        <ExtractingState />
      ) : null}

      {phase === "review" || phase === "saving" ? (
        <ReviewStep
          form={form}
          setForm={setForm}
          orgOptions={orgOptions}
          orgsLoading={orgsLoading}
          lowConfSet={lowConfSet}
          busy={phase === "saving"}
          error={error}
          onSubmit={onSaveContact}
          onBack={() => {
            setError(null);
            setPhase("compose");
          }}
        />
      ) : null}

      {phase === "saved" && saved ? (
        <SavedState
          saved={saved}
          onClose={onClose}
          onOpenSuggestions={onOpenSuggestions}
          onCaptureAnother={resetAll}
        />
      ) : null}

      {phase === "email_saved" && emailIngest ? (
        <EmailSavedState
          summary={emailIngest}
          onClose={onClose}
          onCaptureAnother={resetAll}
          onOpenEmail={onOpenEmail}
        />
      ) : null}
    </WorkspaceCreateDialog>
  );
}

type EmailSavedStateProps = {
  summary: EmailIngestSummary;
  onClose: () => void;
  onCaptureAnother: () => void;
  onOpenEmail?: (emailId: string) => void;
};

function EmailSavedState({
  summary,
  onClose,
  onCaptureAnother,
  onOpenEmail,
}: EmailSavedStateProps) {
  const headline = summary.dedup
    ? "Already in Rex's inbox."
    : summary.extractionsCount > 0
      ? `Rex pulled ${summary.extractionsCount} ${
          summary.extractionsCount === 1 ? "item" : "items"
        } to review.`
      : "Email saved. Rex didn't find anything to extract.";

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="rounded-xl border border-charcoal/10 bg-emerald-50/60 p-3">
        <p className="text-sm text-charcoal">
          <span className="font-semibold">{headline}</span>
        </p>
        {!summary.dedup && summary.attachmentsCount > 0 ? (
          <p className="mt-1 text-xs text-charcoal-light">
            Stored {summary.attachmentsCount}{" "}
            {summary.attachmentsCount === 1 ? "attachment" : "attachments"}.
          </p>
        ) : null}
      </div>

      {!summary.dedup && summary.extractionsCount > 0 ? (
        <p className="text-xs text-charcoal-light/80">
          Open the email in Rex&rsquo;s inbox to confirm the contacts and orgs.
          Each one becomes a real workspace record once you click apply.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={onCaptureAnother}
          className={WORKSPACE_FORM_BTN_SECONDARY}
        >
          Capture another
        </button>
        {onOpenEmail ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={WORKSPACE_FORM_BTN_SECONDARY}
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenEmail(summary.emailId);
                onClose();
              }}
              className={WORKSPACE_FORM_BTN_PRIMARY}
            >
              {summary.dedup
                ? "Open email"
                : summary.extractionsCount > 0
                  ? "Review extractions"
                  : "Open email"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className={WORKSPACE_FORM_BTN_PRIMARY}
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}

type ModeTabsProps = {
  active: Mode;
  onChange: (m: Mode) => void;
};

function ModeTabs({ active, onChange }: ModeTabsProps) {
  const base =
    "flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors";
  return (
    <div
      className="flex gap-1 rounded-xl bg-charcoal/[0.05] p-1"
      role="tablist"
      aria-label="Capture mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={active === "text"}
        onClick={() => onChange("text")}
        className={`${base} ${active === "text" ? "bg-cream text-charcoal shadow-sm" : "text-charcoal-light hover:text-charcoal"}`}
      >
        <Pencil className="size-3.5" aria-hidden /> Text
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "voice"}
        onClick={() => onChange("voice")}
        className={`${base} ${active === "voice" ? "bg-cream text-charcoal shadow-sm" : "text-charcoal-light hover:text-charcoal"}`}
      >
        <Mic className="size-3.5" aria-hidden /> Voice
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "upload"}
        onClick={() => onChange("upload")}
        className={`${base} ${active === "upload" ? "bg-cream text-charcoal shadow-sm" : "text-charcoal-light hover:text-charcoal"}`}
      >
        <Upload className="size-3.5" aria-hidden /> Upload
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "email"}
        onClick={() => onChange("email")}
        className={`${base} ${active === "email" ? "bg-cream text-charcoal shadow-sm" : "text-charcoal-light hover:text-charcoal"}`}
      >
        <Mail className="size-3.5" aria-hidden /> Email
      </button>
    </div>
  );
}

function ExtractingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-charcoal/[0.06] text-charcoal-light">
        <Sparkles className="size-5 animate-pulse" strokeWidth={1.75} aria-hidden />
      </div>
      <p className="font-serif text-lg tracking-tight text-charcoal">
        Rex is reading it…
      </p>
      <p className="text-xs text-charcoal-light/80">
        Pulling out name, firm, sector, and anything else worth keeping.
      </p>
    </div>
  );
}

type ReviewStepProps = {
  form: ReviewForm;
  setForm: (updater: (prev: ReviewForm) => ReviewForm) => void;
  orgOptions: WorkspaceOrganisationPageRow[];
  orgsLoading: boolean;
  lowConfSet: Set<string>;
  busy: boolean;
  error: string | null;
  onSubmit: (e: FormEvent) => void;
  onBack: () => void;
};

function ReviewStep({
  form,
  setForm,
  orgOptions,
  orgsLoading,
  lowConfSet,
  busy,
  error,
  onSubmit,
  onBack,
}: ReviewStepProps) {
  const fieldClass = (field: string) =>
    lowConfSet.has(field)
      ? `${WORKSPACE_FORM_INPUT_CLASS} border-amber-500/70 bg-amber-50/40`
      : WORKSPACE_FORM_INPUT_CLASS;

  const lowConfBadge = (field: string) =>
    lowConfSet.has(field) ? (
      <span className="ml-1 rounded-full bg-amber-200/70 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
        double-check
      </span>
    ) : null;

  return (
    <form onSubmit={onSubmit} className="space-y-3 p-4">
      {form.rexSummary ? (
        <div className="flex items-start gap-2 rounded-xl border border-charcoal/10 bg-cream-light/40 p-3">
          <Sparkles
            className="mt-0.5 size-4 shrink-0 text-charcoal-light"
            strokeWidth={1.75}
            aria-hidden
          />
          <p className="text-sm text-charcoal">{form.rexSummary}</p>
        </div>
      ) : null}

      <div>
        <label htmlFor="qc-name" className={WORKSPACE_FORM_LABEL_CLASS}>
          Name{lowConfBadge("name")}
        </label>
        <input
          id="qc-name"
          required
          value={form.name}
          onChange={(e) =>
            setForm((p) => ({ ...p, name: e.target.value }))
          }
          className={fieldClass("name")}
          placeholder="Full name"
          autoComplete="name"
        />
      </div>

      <div>
        <label htmlFor="qc-type" className={WORKSPACE_FORM_LABEL_CLASS}>
          Type{lowConfBadge("contactType")}
        </label>
        <select
          id="qc-type"
          required
          value={form.contactType}
          onChange={(e) =>
            setForm((p) => ({ ...p, contactType: e.target.value }))
          }
          className={fieldClass("contactType")}
        >
          <option value="">Select a type…</option>
          {CONTACT_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="qc-sector" className={WORKSPACE_FORM_LABEL_CLASS}>
          Sector{lowConfBadge("sector")}
        </label>
        <input
          id="qc-sector"
          required
          value={form.sector}
          onChange={(e) =>
            setForm((p) => ({ ...p, sector: e.target.value }))
          }
          className={fieldClass("sector")}
          placeholder="e.g. Fintech"
        />
      </div>

      <div>
        <label htmlFor="qc-internal-owner" className={WORKSPACE_FORM_LABEL_CLASS}>
          Rex team (internal)
        </label>
        <select
          id="qc-internal-owner"
          required
          value={form.internalOwner}
          onChange={(e) =>
            setForm((p) => ({ ...p, internalOwner: e.target.value }))
          }
          className={WORKSPACE_FORM_INPUT_CLASS}
        >
          {INTERNAL_CONTACT_OWNERS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-charcoal-light/80">
          Who is adding this contact — for your team only.
        </p>
      </div>

      <div>
        <label htmlFor="qc-org" className={WORKSPACE_FORM_LABEL_CLASS}>
          Organisation{lowConfBadge("organisationName")}
        </label>
        <select
          id="qc-org"
          value={form.organisationChoice}
          onChange={(e) => {
            const v = e.target.value;
            setForm((p) => ({
              ...p,
              organisationChoice: v,
              ...(v !== ORG_NEW_VALUE
                ? {
                    inlineOrgName: "",
                    inlineOrgType: "",
                    inlineOrgDescription: "",
                  }
                : {}),
            }));
          }}
          className={WORKSPACE_FORM_INPUT_CLASS}
        >
          <option value="">
            {orgsLoading ? "Loading organisations…" : "No organisation"}
          </option>
          <option value={ORG_NEW_VALUE}>Create new organisation…</option>
          {orgOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        {form.organisationChoice === ORG_NEW_VALUE ? (
          <div className="mt-3 space-y-3 rounded-lg border border-charcoal/10 bg-cream-light/50 p-3">
            <div>
              <label
                htmlFor="qc-new-org-name"
                className={WORKSPACE_FORM_LABEL_CLASS}
              >
                New organisation name
              </label>
              <input
                id="qc-new-org-name"
                required
                value={form.inlineOrgName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, inlineOrgName: e.target.value }))
                }
                className={WORKSPACE_FORM_INPUT_CLASS}
                placeholder="Company or fund name"
                autoComplete="organization"
              />
            </div>
            <div>
              <label
                htmlFor="qc-new-org-type"
                className={WORKSPACE_FORM_LABEL_CLASS}
              >
                Type{" "}
                <span className="font-normal text-charcoal-light/70">
                  (optional)
                </span>
              </label>
              <input
                id="qc-new-org-type"
                value={form.inlineOrgType}
                onChange={(e) =>
                  setForm((p) => ({ ...p, inlineOrgType: e.target.value }))
                }
                className={WORKSPACE_FORM_INPUT_CLASS}
                placeholder="e.g. LP, GP, advisor"
              />
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <label htmlFor="qc-role" className={WORKSPACE_FORM_LABEL_CLASS}>
          Role{lowConfBadge("role")}
        </label>
        <input
          id="qc-role"
          value={form.role}
          onChange={(e) =>
            setForm((p) => ({ ...p, role: e.target.value }))
          }
          className={fieldClass("role")}
          placeholder="Title or function"
        />
      </div>

      <div>
        <label htmlFor="qc-geo" className={WORKSPACE_FORM_LABEL_CLASS}>
          Geography{lowConfBadge("geography")}
        </label>
        <input
          id="qc-geo"
          value={form.geography}
          onChange={(e) =>
            setForm((p) => ({ ...p, geography: e.target.value }))
          }
          className={fieldClass("geography")}
          placeholder="Region or city"
        />
      </div>

      <div>
        <label htmlFor="qc-phone" className={WORKSPACE_FORM_LABEL_CLASS}>
          Phone{lowConfBadge("phone")}
        </label>
        <input
          id="qc-phone"
          value={form.phone}
          onChange={(e) =>
            setForm((p) => ({ ...p, phone: e.target.value }))
          }
          className={fieldClass("phone")}
          placeholder="+44…"
          autoComplete="tel"
        />
      </div>

      <div>
        <label htmlFor="qc-email" className={WORKSPACE_FORM_LABEL_CLASS}>
          Email{lowConfBadge("email")}
        </label>
        <input
          id="qc-email"
          value={form.email}
          onChange={(e) =>
            setForm((p) => ({ ...p, email: e.target.value }))
          }
          className={fieldClass("email")}
          placeholder="name@company.com"
          autoComplete="email"
        />
      </div>

      <div>
        <label htmlFor="qc-notes" className={WORKSPACE_FORM_LABEL_CLASS}>
          Notes
        </label>
        <textarea
          id="qc-notes"
          value={form.notes}
          onChange={(e) =>
            setForm((p) => ({ ...p, notes: e.target.value }))
          }
          rows={3}
          className={`${WORKSPACE_FORM_INPUT_CLASS} resize-y`}
          placeholder="Where you met, what they're looking for…"
        />
      </div>

      {error ? (
        <p className="text-sm text-red-700/90" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className={WORKSPACE_FORM_BTN_SECONDARY}
        >
          Back
        </button>
        <button
          type="submit"
          disabled={busy}
          className={WORKSPACE_FORM_BTN_PRIMARY}
        >
          {busy ? "Saving…" : "Save contact"}
        </button>
      </div>
    </form>
  );
}

type SavedStateProps = {
  saved: QuickCaptureSuccess;
  onClose: () => void;
  onOpenSuggestions?: () => void;
  onCaptureAnother: () => void;
};

function SavedState({
  saved,
  onClose,
  onOpenSuggestions,
  onCaptureAnother,
}: SavedStateProps) {
  const goSuggestions = () => {
    onOpenSuggestions?.();
    onClose();
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="rounded-xl border border-charcoal/10 bg-emerald-50/60 p-3">
        <p className="text-sm text-charcoal">
          <span className="font-semibold">{saved.name}</span> is in your
          contacts.
        </p>
      </div>

      {saved.matches.length > 0 ? (
        <div className="rounded-xl border border-charcoal/10 bg-cream-light/40 p-3">
          <div className="flex items-center gap-2">
            <Sparkles
              className="size-4 text-charcoal-light"
              strokeWidth={1.75}
              aria-hidden
            />
            <p className="text-[11px] font-medium uppercase tracking-wide text-charcoal-light/80">
              Rex thinks you could introduce these matches with {saved.name}
            </p>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {saved.matches.map((m, i) => (
              <li
                key={`${m.counterpartyId}:${i}`}
                className="rounded-lg border border-charcoal/[0.08] bg-cream p-3"
              >
                <p className="text-sm font-semibold text-charcoal">
                  {m.counterpartyName}{" "}
                  <span className="text-xs font-normal text-charcoal-light/80">
                    ({m.counterpartySide})
                  </span>
                </p>
                {m.reasons.length > 0 ? (
                  <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-charcoal-light/90">
                    {m.reasons.slice(0, 3).map((r, j) => (
                      <li key={j}>• {r}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          {onOpenSuggestions ? (
            <button
              type="button"
              onClick={goSuggestions}
              className="mt-3 text-xs font-medium text-charcoal underline underline-offset-2 hover:text-charcoal/80"
            >
              Open Suggestions →
            </button>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-charcoal/15 bg-cream-light/40 p-3 text-center">
          <p className="text-xs text-charcoal-light/90">
            No strong intro matches for {saved.name} yet — Rex will keep an eye
            out as your workspace grows.
          </p>
        </div>
      )}

      <div className="flex justify-between gap-2">
        <button
          type="button"
          onClick={onCaptureAnother}
          className={WORKSPACE_FORM_BTN_SECONDARY}
        >
          Capture another
        </button>
        <button
          type="button"
          onClick={onClose}
          className={WORKSPACE_FORM_BTN_PRIMARY}
        >
          Done
        </button>
      </div>
    </div>
  );
}
