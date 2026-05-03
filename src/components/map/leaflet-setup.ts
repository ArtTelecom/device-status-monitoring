import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default icon path for bundlers
const iconRetinaUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
const iconUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
const shadowUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});

export function makeOltIcon(status: string) {
  const color =
    status === "online" ? "#22c55e" : status === "warning" ? "#f59e0b" : "#ef4444";
  return L.divIcon({
    className: "olt-marker",
    html: `<div style="width:34px;height:34px;border-radius:8px;background:${color};border:3px solid #0a0e14;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px ${color}66, 0 0 16px ${color};color:white;font-weight:bold;font-size:11px;">OLT</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export function makeOnuIcon(status: string) {
  const color =
    status === "online"
      ? "#22c55e"
      : status === "warning"
        ? "#f59e0b"
        : status === "los"
          ? "#dc2626"
          : "#6b7280";
  return L.divIcon({
    className: "onu-marker",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #0a0e14;box-shadow:0 0 8px ${color};"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default L;
