const API = 'http://127.0.0.1:5000/api';

function authHeaders() {
  const authToken = localStorage.getItem('ocr_token') || '';
  return authToken 
    ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken } 
    : { 'Content-Type': 'application/json' };
}

export async function GET(path) {
  try {
    const r = await fetch(API + path, { headers: authHeaders() });
    if (r.status === 401) { 
      return null; // The AuthContext will handle unauth
    }
    return r.ok ? r.json() : null;
  } catch { 
    return null; 
  }
}

export async function POST(path, body) {
  try {
    const r = await fetch(API + path, { 
      method: 'POST', 
      headers: authHeaders(), 
      body: JSON.stringify(body) 
    });
    if (r.status === 401) { 
      return { data: null, status: 401 }; 
    }
    return { data: await r.json(), status: r.status };
  } catch { 
    return { data: null, status: 0 }; 
  }
}

export async function PATCH(path, body) {
  try {
    const r = await fetch(API + path, { 
      method: 'PATCH', 
      headers: authHeaders(), 
      body: JSON.stringify(body) 
    });
    if (r.status === 401) { 
      return { data: null, status: 401 }; 
    }
    return { data: await r.json(), status: r.status };
  } catch { 
    return { data: null, status: 0 }; 
  }
}

export async function fileToB64(file) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = e => res(e.target.result.split(',')[1] || '');
    r.readAsDataURL(file);
  });
}
