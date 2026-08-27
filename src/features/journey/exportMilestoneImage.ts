interface MilestoneImageInput {
  channelTitle: string;
  metricLabel: string;
  target: string;
  observedLabel: string;
  currentValue: string;
}

function isRightToLeft(value: string): boolean {
  return /[\u0590-\u08ff]/u.test(value);
}

function filenamePart(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'channel'
  );
}

function drawLabel(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  width: number,
): void {
  const rtl = isRightToLeft(value);
  context.direction = rtl ? 'rtl' : 'ltr';
  context.textAlign = rtl ? 'right' : 'left';
  const anchor = rtl ? x + width : x;
  context.fillText(value, anchor, y, width);
  context.direction = 'ltr';
  context.textAlign = 'left';
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The milestone image could not be created.'));
    }, 'image/png');
  });
}

export async function exportMilestoneImage({
  channelTitle,
  metricLabel,
  target,
  observedLabel,
  currentValue,
}: MilestoneImageInput): Promise<void> {
  await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image export is unavailable in this browser.');

  const background = context.createLinearGradient(0, 0, 1080, 1080);
  background.addColorStop(0, '#0a0b0e');
  background.addColorStop(1, '#11121a');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = '#15161c';
  context.fillRect(72, 72, 936, 936);
  context.strokeStyle = '#2d3039';
  context.lineWidth = 2;
  context.strokeRect(72, 72, 936, 936);

  context.strokeStyle = '#8f7ff1';
  context.lineWidth = 7;
  context.beginPath();
  context.moveTo(120, 150);
  context.lineTo(155, 126);
  context.lineTo(190, 148);
  context.stroke();
  for (const [x, y, color] of [
    [120, 150, '#8f7ff1'],
    [155, 126, '#b3a9ff'],
    [190, 148, '#cba75b'],
  ] as const) {
    context.beginPath();
    context.fillStyle = color;
    context.arc(x, y, 8, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = '#f2f2f4';
  context.font = '650 34px "Inter Variable", Inter, sans-serif';
  context.fillText('TubeMilestones', 220, 158);

  context.fillStyle = '#b3a9ff';
  context.font = '650 24px "Inter Variable", Inter, sans-serif';
  context.letterSpacing = '3px';
  context.fillText('MILESTONE ACHIEVED', 120, 308);
  context.letterSpacing = '0px';

  context.fillStyle = '#cba75b';
  context.font = '650 150px "Inter Variable", Inter, sans-serif';
  context.fillText(target, 112, 505, 850);

  context.fillStyle = '#f2f2f4';
  context.font = '620 42px "Inter Variable", Inter, sans-serif';
  context.fillText(metricLabel, 120, 570, 840);

  context.fillStyle = '#747680';
  context.font = '500 26px "Inter Variable", Inter, sans-serif';
  context.fillText(observedLabel, 120, 638, 840);

  context.strokeStyle = '#343741';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(120, 708);
  context.lineTo(960, 708);
  context.stroke();

  context.fillStyle = '#a7a8b1';
  context.font = '500 24px "Inter Variable", Inter, sans-serif';
  context.fillText('CURRENT CHANNEL VALUE', 120, 774);
  context.fillStyle = '#f2f2f4';
  context.font = '650 48px "Inter Variable", Inter, sans-serif';
  context.fillText(currentValue, 120, 837, 840);

  context.fillStyle = '#a7a8b1';
  context.font = '500 26px "Inter Variable", Inter, sans-serif';
  drawLabel(context, channelTitle, 120, 928, 840);

  const blob = await canvasBlob(canvas);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tubemilestones-${filenamePart(channelTitle)}-${filenamePart(target)}-${filenamePart(metricLabel)}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
