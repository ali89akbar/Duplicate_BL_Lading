import * as XLSX from 'xlsx';

export function normalizeRow(row) {
  const lookup = {};
  Object.keys(row).forEach(k => {
    lookup[k.toLowerCase().replace(/[\s_\-\/\.]+/g, '')] = k;
  });

  function pick(...candidates) {
    for (const c of candidates) {
      const key = lookup[c.toLowerCase().replace(/[\s_\-\/\.]+/g, '')];
      if (key != null && String(row[key]).trim() !== '') return String(row[key]).trim();
    }
    return '';
  }

  return {
    screening_date: pick('screening_date', 'screeningdate', 'date', 'screening date', 'screendate'),
    product: pick('product', 'type', 'doc_type', 'doctype', 'product type'),
    bl_number: pick('bl_number', 'blnumber', 'bl number', 'bl no', 'blno', 'bol', 'bill of lading', 'invoice_number', 'invoicenumber', 'invoice no', 'inv no'),
    master_bl: pick('master_bl', 'masterbl', 'master bl', 'master b/l', 'mbl', 'master bol'),
    vessel_name: pick('vessel_name', 'vesselname', 'vessel name', 'vessel', 'ship name', 'vessel/voyage'),
    shipping_company: pick('shipping_company', 'shippingcompany', 'shipping company', 'carrier', 'shipping co', 'freight_company', 'freight company', 'freight co'),
    dr_ccy: pick('dr_ccy', 'drccy', 'dr ccy', 'ccy', 'currency', 'dr currency', 'currency code'),
    amount: pick('amount', 'amt', 'value', 'dr amount', 'dr_amount', 'transaction_amount', 'txn amount'),
    portal_ref_no: pick('portal_ref_no', 'portalrefno', 'portal ref no', 'portal refno', 'portal ref', 'refno', 'ref no', 'reference', 'reference_no', 'portal reference', 'dcp ref', 'txn ref'),
  };
}

export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
        const parsedRows = raw.map(normalizeRow);
        resolve(parsedRows);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsBinaryString(file);
  });
}
