import { type ExportFigure, type ExportLine } from './ui/export';

/** Mappt eine runtime-Figure auf das serialisierbare ExportFigure-Format. */
export function toExportFig(fig: any): ExportFigure {
  return {
    id: fig.id,
    label: fig.label,
    x: fig.root?.position?.x ?? fig.x ?? 0,
    z: fig.root?.position?.z ?? fig.z ?? 0,
    facingY: fig.facingY ?? 0,
    color: fig.appearance?.color ?? fig.color,
    figureType: fig.figureType,
    ownerId: fig.ownerId,
    // NEU (T000605) — vollständiger Roundtrip:
    scale: fig.scale,
    preset: fig.preset,
    note: fig.note,
    boneOverrides: fig.boneOverrides ? { ...fig.boneOverrides } : undefined,
    appearance: fig.appearance ? { ...fig.appearance } : undefined,
  };
}

/** Mappt eine BrettLine (STATE.lines) auf das serialisierbare ExportLine-Format. */
export function toExportLine(line: any): ExportLine {
  return {
    id: line.id,
    fromId: line.fromId,
    toId: line.toId,
    lineType: line.lineType,
  };
}
