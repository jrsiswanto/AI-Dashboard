/* =====================================================================
   MAIN.JS - MASTER-DETAIL & CAROUSEL INSIGHTS (LOCAL AI) - FINAL STRICT
===================================================================== */

const CONFIG = {
  OLLAMA_URL: 'http://localhost:11434/api/generate',
  OLLAMA_MODEL: 'llama3.2:1b', 
  DATA_FILE: 'Sales_BY_Category_202606040914-1.csv' 
};

let barChartInstance = null;
let scatterChartInstance = null;
let globalSummary = {};     
let globalAnomalies = [];   

let insightSlides = [];
let currentSlide = 0;

function parseNum(val) {
  if (val === undefined || val === null || val === '') return 0;
  return parseFloat(String(val).trim().replace(',', '.')) || 0;
}

function formatCurrency(val) {
  if(val >= 1000) return '$' + (val/1000).toFixed(1) + 'k'; 
  return '$' + val.toFixed(0);
}

function mean(arr) { return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length; }
function stdDev(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
function zScore(value, arr) {
  const s = stdDev(arr);
  return s === 0 ? 0 : (value - mean(arr)) / s;
}

function detectAnomalies(data) {
  let anomalies = [];
  
  let minusMargin = data.filter(d => d.margin < 0);
  minusMargin.forEach(d => {
    anomalies.push(`Sub-Kategori "${d.subcat}" (Induk: ${d.category}) mengalami defisit margin ${d.margin.toFixed(1)}% meskipun volume penjualannya mencapai $${d.sales.toFixed(0)}.`);
  });

  let highMargin = data.filter(d => d.margin > 50 && d.sales > 1000);
  highMargin.forEach(d => {
    anomalies.push(`Sub-Kategori "${d.subcat}" (Induk: ${d.category}) meraup margin luar biasa tinggi hingga ${d.margin.toFixed(1)}% dari total penjualan $${d.sales.toFixed(0)}.`);
  });

  return anomalies;
}

async function callOllama(prompt) {
  const res = await fetch(CONFIG.OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.OLLAMA_MODEL,
      prompt: prompt,
      stream: false,
      options: { temperature: 0.1, num_predict: 800 } // Temperature diturunkan agar AI tidak terlalu "kreatif"
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.response || '';
}

function formatAIResponse(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '<b class="text-slate-900">$1</b>').replace(/\n/g, '<br>');                                   
}

// Parser Ketat
function parseListIntoSlides(text) {
  if (text.includes('|||')) {
    const parts = text.split('|||').map(s => s.trim()).filter(s => s.length > 20);
    return parts.slice(0, 3);
  } else {
    const parts = text.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length > 30);
    return parts.length > 0 ? parts.slice(0, 3) : [text];
  }
}

function renderSlide() {
  const box = document.getElementById('box-ai-insight');
  const indicator = document.getElementById('carousel-indicator');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  
  // Jika karena suatu hal slide kosong, berikan fallback
  const slideContent = insightSlides[currentSlide] || "Gagal memproses solusi. Silakan Regenerate.";

  box.innerHTML = `
    <div class="bg-brand-50 border border-brand-100 p-6 rounded-xl w-full h-full min-h-[160px] flex items-center">
      <p class="text-slate-700 text-sm leading-relaxed text-justify w-full">${formatAIResponse(slideContent)}</p>
    </div>`;
  
  indicator.innerText = `Solusi ${currentSlide + 1} dari ${insightSlides.length}`;
  btnPrev.disabled = currentSlide === 0;
  btnNext.disabled = currentSlide === insightSlides.length - 1;
}

function initCharts(categoryData, subcatData) {
  Chart.defaults.font.family = '"Plus Jakarta Sans", sans-serif';
  const ctxBar = document.getElementById('chart-bar-comparison').getContext('2d');
  const top5Cat = categoryData.slice(0, 5);
  
  if(barChartInstance) barChartInstance.destroy();
  barChartInstance = new Chart(ctxBar, {
    type: 'bar',
    data: {
      labels: top5Cat.map(d => d[0]),
      datasets: [
        { label: 'Sales', data: top5Cat.map(d => d[1].sales), backgroundColor: '#3b82f6', borderRadius: 4 },
        { label: 'Profit', data: top5Cat.map(d => d[1].profit), backgroundColor: '#14b8a6', borderRadius: 4 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  const ctxScatter = document.getElementById('chart-scatter-performance').getContext('2d');
  const scatterDataPoints = subcatData.map(d => ({ x: d.sales, y: d.profit, subcat: d.subcat, margin: d.margin }));

  if(scatterChartInstance) scatterChartInstance.destroy();
  scatterChartInstance = new Chart(ctxScatter, {
    type: 'scatter',
    data: {
      datasets: [{
        data: scatterDataPoints,
        backgroundColor: (ctx) => (!ctx.raw) ? '#94a3b8' : (ctx.raw.y < 0 ? '#e11d48' : '#14b8a6'),
        pointRadius: 6,
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  
  d3.csv(CONFIG.DATA_FILE).then(function(data) {
    const rawData = data.map(d => ({ category: d.Category, subcat: d.SubCategory, sales: parseNum(d.Sales), profit: parseNum(d.Profit), qty: parseNum(d.Qty) }));

    const totalSales = d3.sum(rawData, d => d.sales);
    const totalProfit = d3.sum(rawData, d => d.profit);
    const overallMargin = totalSales === 0 ? 0 : (totalProfit / totalSales) * 100;

    globalSummary = { sales: totalSales, profit: totalProfit, margin: overallMargin };

    document.getElementById('kpi-sales').innerText = '$' + new Intl.NumberFormat('en-US').format(totalSales);
    document.getElementById('kpi-profit').innerText = '$' + new Intl.NumberFormat('en-US').format(totalProfit);
    document.getElementById('kpi-margin').innerText = overallMargin.toFixed(1) + '%';
    document.getElementById('kpi-orders').innerText = new Intl.NumberFormat('id-ID').format(d3.sum(rawData, d => d.qty));

    const categoryRollup = d3.rollups(rawData, v => ({
      sales: d3.sum(v, d => d.sales), profit: d3.sum(v, d => d.profit),
      margin: d3.sum(v, d => d.sales) === 0 ? 0 : (d3.sum(v, d => d.profit) / d3.sum(v, d => d.sales)) * 100
    }), d => d.category).sort((a, b) => b[1].sales - a[1].sales); 

    const tableBody = document.getElementById('table-category');
    tableBody.innerHTML = '';
    categoryRollup.forEach(([cat, stats]) => {
      const marginColor = stats.margin >= 15 ? 'text-brand-600' : (stats.margin > 0 ? 'text-orange-500' : 'text-rose-600');
      tableBody.innerHTML += `<tr>
        <td class="px-4 py-3 font-bold text-slate-900">${cat}</td>
        <td class="px-4 py-3 text-right text-slate-700">${formatCurrency(stats.sales)}</td>
        <td class="px-4 py-3 text-right font-extrabold ${marginColor}">${stats.margin.toFixed(1)}%</td>
      </tr>`;
    });

    const subcatRollup = d3.rollups(rawData, v => ({
        sales: d3.sum(v, d => d.sales), profit: d3.sum(v, d => d.profit), category: v[0].category 
    }), d => d.subcat).map(([subcat, stats]) => ({
        subcat: subcat, category: stats.category, sales: stats.sales, profit: stats.profit, margin: stats.sales === 0 ? 0 : (stats.profit / stats.sales) * 100
    }));

    globalAnomalies = detectAnomalies(subcatRollup);
    const listAnomalies = document.getElementById('list-anomalies');
    if (globalAnomalies.length > 0) {
      listAnomalies.innerHTML = globalAnomalies.map(a => `<li>${a}</li>`).join('');
    } else {
      listAnomalies.innerHTML = `<li class="text-brand-600 list-none">Semua data terlihat normal.</li>`;
    }

    initCharts(categoryRollup, subcatRollup);
  });

  // ── TOMBOL CONFLICT ───────────────────────────────────────────
  document.getElementById('btn-ai-conflict').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const box = document.getElementById('box-ai-conflict');
    
    btn.disabled = true;
    btn.innerText = "Mendiagnosis...";
    box.innerHTML = `<p class="animate-pulse text-rose-600 text-sm font-medium w-full text-center">Menarik kesimpulan mendalam dari anomali data...</p>`;

    const prompt = `Sebagai konsultan bisnis senior, jelaskan akar penyebab anomali penjualan berikut: ${globalAnomalies.join(' ')}. 
ATURAN MUTLAK:
1. Buat penjelasan yang SANGAT PANJANG, rinci, dan mendalam (minimal 6 kalimat).
2. Bahas keterkaitan antara strategi diskon, kesalahan HPP, atau inefisiensi biaya.
3. WAJIB DITULIS DALAM TEPAT 1 PARAGRAF UTUH SAJA. Jangan ada baris baru (enter), jangan ada poin/nomor. Tulis mengalir saja.`;

    try {
      const aiResponse = await callOllama(prompt);
      box.innerHTML = `<div class="bg-rose-50/50 p-6 rounded-xl border border-rose-100 w-full min-h-[160px] flex items-center"><p class="text-slate-700 text-sm leading-relaxed text-justify w-full">${formatAIResponse(aiResponse)}</p></div>`;
      btn.innerText = "Regenerate Diagnosis";
    } catch (error) {
      box.innerHTML = `<p class="text-rose-600 text-sm w-full text-center">Gagal terhubung ke Ollama.</p>`;
      btn.innerText = "Coba Lagi";
    }
    btn.disabled = false;
  });

  // ── TOMBOL INSIGHT (STRICT FORMATTING) ─────────────────────────
  document.getElementById('btn-ai-insight').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const box = document.getElementById('box-ai-insight');
    const nav = document.getElementById('carousel-nav');
    
    btn.disabled = true;
    btn.innerText = "Merumuskan...";
    nav.classList.add('hidden'); 
    box.innerHTML = `<p class="animate-pulse text-brand-600 text-sm font-medium w-full text-center">Merumuskan strategi perbaikan dan action plan...</p>`;

    // PROMPT DIKUNCI MATI
    const prompt = `Tugas: Berikan 3 solusi strategis untuk anomali berikut: ${globalAnomalies.join(' ')}.

ATURAN MUTLAK (JIKA DILANGGAR JAWABAN GAGAL):
1. DILARANG KERAS MEMBERIKAN KATA PENGANTAR. JANGAN TULIS "Berikut adalah solusinya". LANGSUNG MULAI DENGAN SOLUSI PERTAMA!
2. Setiap solusi HARUS berupa SATU PARAGRAF PANJANG (minimal 4 kalimat) berisi Real Action dan sebutkan ulang angkanya.
3. DILARANG menggunakan angka, bullet point, atau enter di dalam solusi.
4. PISAHKAN SETIAP SOLUSI DENGAN TANDA "|||" (TIGA GARIS VERTIKAL).

FORMAT WAJIB ANDA:
Melakukan audit menyeluruh pada proses Harga Pokok Penjualan (HPP) karena saat ini margin mengalami defisit sebesar X persen. Tim akuntansi harus memeriksa ulang faktur pembelian bulan lalu... (lanjutkan sampai 4 kalimat).
|||
Menerapkan strategi cross-selling antara produk aksesoris yang untung besar dengan produk pakaian yang rugi. Tim marketing perlu membuat paket bundling promosi... (lanjutkan sampai 4 kalimat).
|||
Mengevaluasi kontrak dengan pihak pemasok utama pakaian untuk menekan biaya bahan baku. Divisi pengadaan barang wajib melakukan negosiasi ulang... (lanjutkan sampai 4 kalimat).`;

    try {
      const aiResponse = await callOllama(prompt);
      
      // Filter out any garbage intro if AI still disobeys
      let cleanedResponse = aiResponse;
      if (cleanedResponse.includes('|||')) {
          // Sometimes AI adds intro text before the first actual paragraph.
          // Because we force it to start immediately, we trust the split.
          insightSlides = parseListIntoSlides(cleanedResponse);
      } else {
          insightSlides = [cleanedResponse]; // Fallback
      }

      currentSlide = 0;
      
      renderSlide(); 
      
      if(insightSlides.length > 1) {
        nav.classList.remove('hidden'); 
      }
      
      btn.innerText = "Regenerate Solusi";
    } catch (error) {
      box.innerHTML = `<p class="text-rose-600 text-sm w-full text-center">Gagal terhubung ke Ollama.</p>`;
      btn.innerText = "Coba Lagi";
    }
    btn.disabled = false;
  });

  // ── EVENT LISTENER TOMBOL PREV/NEXT CAROUSEL ─────────────────
  document.getElementById('btn-prev').addEventListener('click', () => {
    if (currentSlide > 0) { currentSlide--; renderSlide(); }
  });
  
  document.getElementById('btn-next').addEventListener('click', () => {
    if (currentSlide < insightSlides.length - 1) { currentSlide++; renderSlide(); }
  });

});