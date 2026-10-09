// Render at twice the projection resolution to keep names sharp when zooming.
export function createClassPdf(room, canvas = document.createElement('canvas'), variant = 1) {
  const width = 1600, height = 900, scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  const text = (value, x, y, size, color = '#14243c', maxWidth = width) => {
    ctx.fillStyle = color;
    ctx.font = `600 ${size}px Arial, sans-serif`;
    while (ctx.measureText(value).width > maxWidth && size > 6) {
      size -= 0.5;
      ctx.font = `600 ${size}px Arial, sans-serif`;
    }
    ctx.fillText(value, x, y, maxWidth);
  };
  const palette=variant===2?{ink:'#183a39',line:'#9ebcb8',fill:'#f0f7f5',board:'#24534c'}:variant===3?{ink:'#2a2d34',line:'#999fa8',fill:'#ffffff',board:'#303640'}:{ink:'#14243c',line:'#b1c2d8',fill:'#f2f6fc',board:'#263f60'};
  const rounded=(x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();};
  if(variant===2){ctx.fillStyle='#f0f7f5';ctx.fillRect(0,0,width,78);}
  if(variant===3){ctx.fillStyle=palette.ink;ctx.fillRect(40,22,5,50);}
  ctx.textAlign = variant===3?'left':'center';
  text(room.className,variant===3?64:width/2,46,32,palette.ink,width-150);
  text(room.name||'Salle',variant===3?64:width/2,71,18,'#63748a',width-150);
  ctx.textAlign='center';
  ctx.fillStyle = palette.board;
  rounded(540, 94, 520, 36,variant===3?2:9);
  text('TABLEAU', width / 2, 118, 17, '#ffffff');
  const left = 40, top = 156, areaWidth = width - 80, areaHeight = height - top - 54;
  const gapX = 18, gapY = 16;
  const deskWidth = (areaWidth - gapX * (room.columns - 1)) / room.columns;
  const deskHeight = (areaHeight - gapY * (room.rows - 1)) / room.rows;
  const students = new Map(room.students.map(s => [s.id, s.name]));
  for (let row = 0; row < room.rows; row++) {
    for (let column = 0; column < room.columns; column++) {
      const x = left + column * (deskWidth + gapX), y = top + row * (deskHeight + gapY);
      ctx.fillStyle = palette.fill;
      rounded(x,y,deskWidth,deskHeight,variant===3?2:10);
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if(variant===1){ctx.fillStyle='#dce6f4';ctx.fillRect(x+10,y+deskHeight-4,deskWidth-20,3);}
      if(variant===2){ctx.fillStyle=palette.line;rounded(x+deskWidth*.12,y+deskHeight+3,deskWidth*.25,4,2);rounded(x+deskWidth*.63,y+deskHeight+3,deskWidth*.25,4,2);}
      ctx.beginPath();ctx.moveTo(x + deskWidth / 2, y);ctx.lineTo(x + deskWidth / 2, y + deskHeight);ctx.stroke();
      for (let side = 0; side < 2; side++) {
        const name = students.get(room.seats[(row * room.columns + column) * 2 + side]);
        const center = x + deskWidth * (side ? 0.75 : 0.25);
        if (!name) { text('Libre', center, y + deskHeight / 2 + 6, Math.min(18, deskHeight / 3), '#7c8a9c');continue; }
        const words = name.trim().split(/\s+/);
        const lines = words.length > 1 ? [words[0], words.slice(1).join(' ')] : [name];
        const size = Math.min(26, deskHeight / 3, deskWidth / 10);
        const lineHeight = size * 1.25;
        lines.forEach((line, i) => text(line, center, y + deskHeight / 2 + (i - (lines.length - 1) / 2) * lineHeight + size * 0.35, size, palette.ink, deskWidth / 2 - 16));
      }
    }
  }
  const placed = room.seats.filter(id => students.has(id)).length;
  const unplaced = room.students.length - placed;
  text(`${placed} élèves placés${unplaced ? ` • ${unplaced} élèves non placés` : ''}`, width / 2, height - 18, 15, '#63748a');
  const jpeg = Uint8Array.from(atob(canvas.toDataURL('image/jpeg', 0.96).split(',')[1]), c => c.charCodeAt(0));
  return imagePdf(jpeg, canvas.width, canvas.height);
}

// A single image page keeps accented names independent of PDF font support.
function imagePdf(jpeg, pixelWidth, pixelHeight) {
  const encode = value => new TextEncoder().encode(value);
  const chunks = [encode('%PDF-1.4\n')], offsets = [0];
  let length = chunks[0].length;
  const append = chunk => { chunks.push(chunk);length += chunk.length; };
  const object = (id, body, bytes) => {
    offsets[id] = length;
    append(encode(`${id} 0 obj\n${body}`));
    if (bytes) { append(encode('\nstream\n'));append(bytes);append(encode('\nendstream')); }
    append(encode('\nendobj\n'));
  };
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Resources << /XObject << /Plan 4 0 R >> >> /Contents 5 0 R >>');
  object(4, `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  const commands = encode('q 960 0 0 540 0 0 cm /Plan Do Q');
  object(5, `<< /Length ${commands.length} >>`, commands);
  const xref = length;
  append(encode('xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')));
  append(encode(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return new Blob(chunks, {type:'application/pdf'});
}

export function downloadClassPdf(room, variant = 1) {
  const url = URL.createObjectURL(createClassPdf(room, undefined, variant));
  const link = document.createElement('a');
  link.href = url;
  link.download = `plan-${room.className.replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '') || 'classe'}-v${variant}.pdf`;
  document.body.append(link);link.click();link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
