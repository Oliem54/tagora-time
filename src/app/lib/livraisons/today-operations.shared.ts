/** Date locale YYYY-MM-DD (alignée sur les pages livraison / ramassage). */
export function getLocalTodayIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTodayOperationCount(mode: "livraison" | "ramassage", count: number) {
  if (count <= 0) return "";
  if (mode === "livraison") {
    return count === 1 ? "1 livraison" : `${count} livraisons`;
  }
  return count === 1 ? "1 ramassage" : `${count} ramassages`;
}

export function formatTodayOperationCountShort(mode: "livraison" | "ramassage", count: number) {
  if (count <= 0) return "";
  if (mode === "livraison") {
    return count === 1 ? "Livr. 1" : `Livr. ${count}`;
  }
  return count === 1 ? "Ram. 1" : `Ram. ${count}`;
}
