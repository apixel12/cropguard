declare module 'virtual:model-integrity' {
  /** pathname (e.g. /models/crops-v2/model.json) -> "sha256-<base64>" */
  const hashes: Record<string, string>
  export default hashes
}
