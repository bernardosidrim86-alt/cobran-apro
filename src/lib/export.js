function escapeCsv(value){
  let text=String(value ?? "");
  // Spreadsheet applications may evaluate cells beginning with formula markers.
  const firstNonWhitespace=text.trimStart().charAt(0);
  if(firstNonWhitespace==="="||firstNonWhitespace==="+"||firstNonWhitespace==="-"||firstNonWhitespace==="@")text="'"+text;
  return /[;"\n\r\t]/.test(text) ? '"' + text.replace(/"/g,'""') + '"' : text;
}

export function downloadCsv(filename, columns, rows){
  const header=columns.map(c=>escapeCsv(c.label)).join(";");
  const body=rows.map(row=>columns.map(c=>escapeCsv(typeof c.value==="function"?c.value(row):row[c.key])).join(";")).join("\n");
  const blob=new Blob(["\uFEFF"+header+"\n"+body],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download=filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
