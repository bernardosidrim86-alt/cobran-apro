function field(id,value){
  const text=String(value ?? "");
  return id + String(text.length).padStart(2,"0") + text;
}

function crc16(payload){
  let crc=0xFFFF;
  for(let i=0;i<payload.length;i++){
    crc ^= payload.charCodeAt(i) << 8;
    for(let bit=0;bit<8;bit++){
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4,"0");
}

function sanitize(value,max){
  return String(value||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^A-Za-z0-9 ]/g,"")
    .replace(/\s+/g," ")
    .trim()
    .slice(0,max);
}

export function buildPixPayload({key,amount,merchantName,merchantCity,txid="***"}){
  if(!key) return "";
  const name=sanitize(merchantName||"Minha empresa",25);
  const city=sanitize(merchantCity||"SAO PAULO",15).toUpperCase();
  const merchantInfo=field("00","BR.GOV.BCB.PIX")+field("01",String(key).trim());
  let payload=field("00","01")+field("26",merchantInfo)+field("52","0000")+field("53","986");
  const numericAmount=Number(amount);
  if(Number.isFinite(numericAmount)&&numericAmount>0) payload+=field("54",numericAmount.toFixed(2));
  payload+=field("58","BR")+field("59",name)+field("60",city)+field("62",field("05",sanitize(txid,25)||"***"));
  return payload+"6304"+crc16(payload+"6304");
}
