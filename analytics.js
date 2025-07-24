

function getRecentSearches() {
  return JSON.parse(localStorage.getItem('recentRiskSearches') || '[]');
}

function setRecentSearch(search) {
  let searches = getRecentSearches();
  searches.unshift(search);
  if (searches.length > 10) searches = searches.slice(0, 10);
  localStorage.setItem('recentRiskSearches', JSON.stringify(searches));
}

function populateSummary(latest) {
  document.querySelector('#summary-region span').textContent = latest.region || '-';
  document.querySelector('#summary-risk span').textContent = latest.score ?? '-';
  document.querySelector('#summary-level span').textContent = latest.level || '-';
  document.querySelector('#summary-factors span').textContent = latest.breakdown ? latest.breakdown.map(b => b.factor).join(', ') : '-';
}

function renderBreakdownChart(breakdown) {
  const ctx = document.getElementById('breakdownChart').getContext('2d');
  if (!breakdown || breakdown.length === 0) return;
  new Chart(ctx, {
    type: 'pie',
    data: {
      labels: breakdown.map(b => b.factor),
      datasets: [{
        data: breakdown.map(b => parseInt(b.value.replace(/[^\d-]/g, '')) || 0),
        backgroundColor: [
          '#43cea2', '#ff9800', '#e53935', '#185a9d', '#8e44ad', '#f4d03f'
        ],
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}

function renderTrendChart(searches) {
  const ctx = document.getElementById('trendChart').getContext('2d');
  if (!searches.length) return;
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: searches.map(s => s.region || 'Unknown').reverse(),
      datasets: [{
        label: 'Risk Score',
        data: searches.map(s => s.score).reverse(),
        borderColor: '#185a9d',
        backgroundColor: 'rgba(67,206,162,0.2)',
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

function populateRecentList(searches) {
  const list = document.getElementById('recent-list');
  list.innerHTML = '';
  if (!searches.length) {
    list.innerHTML = '<li>No recent searches.</li>';
    return;
  }
  searches.forEach(s => {
    const li = document.createElement('li');
    li.textContent = `${s.region || 'Unknown'} | Score: ${s.score} | Level: ${s.level}`;
    list.appendChild(li);
  });
}


document.addEventListener('DOMContentLoaded', () => {
  const searches = getRecentSearches();
  if (!searches.length) return;
  const latest = searches[0];
  populateSummary(latest);
  renderBreakdownChart(latest.breakdown || []);
  renderTrendChart(searches);
  populateRecentList(searches);
}); 