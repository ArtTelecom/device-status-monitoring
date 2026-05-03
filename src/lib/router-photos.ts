// Каталог фото по моделям. Дефолтное — предыдущая картинка с фиолетово-голубым неоном.
export const ROUTER_PHOTOS: Record<string, string> = {
  CCR2004:
    "https://cdn.poehali.dev/projects/4e28f997-118c-46af-9ba3-05afe46c8699/files/63330f23-43fd-46d3-89b1-914eaa853751.jpg",
  default:
    "https://cdn.poehali.dev/projects/4e28f997-118c-46af-9ba3-05afe46c8699/files/63330f23-43fd-46d3-89b1-914eaa853751.jpg",
};

export function pickPhotoForModel(_model: string | undefined): string {
  return ROUTER_PHOTOS.default;
}