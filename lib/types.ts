// Shared types used across the client store, agent loop, and UI.

export type Role = "user" | "assistant" | "system";

/** A virtual file tree: path -> file contents (text). Binary uploads are kept
 *  separately as base64 in UploadedFile. */
export type FileTree = Record<string, string>;

export interface UploadedFile {
  name: string;
  /** Detected/declared mime, best-effort. */
  mime: string;
  size: number;
  /** True when we treated the file as text and inlined `text`. */
  isText: boolean;
  /** Present when isText. */
  text?: string;
  /** For .zip we expand entries into this map (path -> text) when they are text. */
  archiveEntries?: FileTree;
  /** Short human note about how the file was handled (e.g. binary inspection). */
  note?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  /** Files attached to a user message. */
  attachments?: UploadedFile[];
  /** Transient status for assistant messages while the agent works. */
  status?: "streaming" | "building" | "fixing" | "done" | "error";
  /** Free-text status detail shown under the message. */
  statusDetail?: string;
  createdAt: number;
}

export interface ProductVersion {
  id: string;
  label: string;
  files: FileTree;
  /** "web" if it renders in the browser preview, otherwise "files". */
  kind: "web" | "files";
  createdAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  messages: ChatMessage[];
  /** The current working product. */
  files: FileTree;
  kind: "web" | "files";
  versions: ProductVersion[];
  /** Stacked adjustment requests waiting to be applied to the product. */
  queue: string[];
  createdAt: number;
  updatedAt: number;
}

/** Result of parsing a model turn into concrete file operations. */
export interface AgentTurn {
  /** Assistant prose (everything that was not a file block). */
  note: string;
  /** New/updated files. */
  files: FileTree;
  /** Files the model asked to delete. */
  deletions: string[];
  /** Whether the model signalled the product is complete. */
  done: boolean;
}
