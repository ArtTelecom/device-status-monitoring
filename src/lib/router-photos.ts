// Каталог фото по моделям. При совпадении подставится подходящая фотка.
export const ROUTER_PHOTOS: Record<string, string> = {
  "RB4011iGS+":
    "https://cdn.poehali.dev/projects/4e28f997-118c-46af-9ba3-05afe46c8699/files/414735a2-25e4-4328-94e0-82496cda031c.jpg",
  // CCR-серия / общие
  CCR2004:
    "https://cdn.poehali.dev/projects/4e28f997-118c-46af-9ba3-05afe46c8699/files/63330f23-43fd-46d3-89b1-914eaa853751.jpg",
  default:
    "https://cdn.poehali.dev/projects/4e28f997-118c-46af-9ba3-05afe46c8699/files/63330f23-43fd-46d3-89b1-914eaa853751.jpg",
};

export function pickPhotoForModel(model: string | undefined): string {
  if (!model) return ROUTER_PHOTOS.default;
  const m = model.toUpperCase();
  if (m.includes("RB4011")) return ROUTER_PHOTOS["RB4011iGS+"];
  if (m.includes("CCR2004") || m.includes("CCR")) return ROUTER_PHOTOS.CCR2004;
  return ROUTER_PHOTOS.default;
}
