"use strict";

const samplePatients = [
  { id: "E01", arrival: 0, duration: 7, urgency: "urgent" },
  { id: "E02", arrival: 2, duration: 4, urgency: "immediate" },
  { id: "E03", arrival: 4, duration: 1, urgency: "routine" },
  { id: "E04", arrival: 5, duration: 4, urgency: "very-urgent" },
];

const colors = ["#7188bd", "#35a18f", "#d39a43", "#8c78c7", "#4d9ac0", "#ce7771", "#679b70", "#b577a3"];
const urgencyRank = { immediate: 1, "very-urgent": 2, urgent: 3, routine: 4 };
const urgencyLabels = { immediate: "Immediate", "very-urgent": "Very urgent", urgent: "Urgent", routine: "Routine" };
let patients = samplePatients.map((patient) => ({ ...patient }));
let schedule = [];

const form = document.querySelector("#patient-form");
const queueBody = document.querySelector("#queue-body");
const resultsBody = document.querySelector("#results-body");
const queueEmpty = document.querySelector("#queue-empty");
const resultsEmpty = document.querySelector("#results-empty");
const formMessage = document.querySelector("#form-message");

function formatNumber(value) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function currentMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function comparePriority(a, b) {
  return urgencyRank[a.urgency] - urgencyRank[b.urgency]
    || a.arrival - b.arrival
    || a.order - b.order;
}

function calculateSchedule() {
  const mode = currentMode();
  const remaining = new Map(patients.map((patient) => [patient.id, patient.duration]));
  const completed = new Map();
  const segments = [];
  let time = 0;

  while (completed.size < patients.length) {
    const ready = patients
      .filter((patient) => patient.arrival <= time && !completed.has(patient.id))
      .map((patient) => ({ ...patient, order: patients.indexOf(patient) }))
      .sort(comparePriority);

    if (ready.length === 0) {
      const nextArrival = Math.min(...patients
        .filter((patient) => !completed.has(patient.id))
        .map((patient) => patient.arrival));
      if (nextArrival > time) {
        segments.push({ id: "IDLE", start: time, end: nextArrival, idle: true });
        time = nextArrival;
      }
      continue;
    }

    const selected = ready[0];
    const start = time;
    let end;

    if (mode === "preemptive") {
      const nextArrival = Math.min(...patients
        .filter((patient) => !completed.has(patient.id) && patient.arrival > time)
        .map((patient) => patient.arrival)
        .concat([Infinity]));
      const runFor = Math.min(remaining.get(selected.id), nextArrival - time);
      end = time + runFor;
      remaining.set(selected.id, remaining.get(selected.id) - runFor);
    } else {
      end = time + remaining.get(selected.id);
      remaining.set(selected.id, 0);
    }

    const lastSegment = segments[segments.length - 1];
    if (lastSegment && lastSegment.id === selected.id && lastSegment.end === start) {
      lastSegment.end = end;
    } else {
      segments.push({ id: selected.id, start, end });
    }
    time = end;

    if (remaining.get(selected.id) <= 1e-9) {
      remaining.set(selected.id, 0);
      completed.set(selected.id, time);
    }
  }

  schedule = segments;
}

function renderQueue() {
  queueBody.innerHTML = patients.map((patient) => `
    <tr style="--row-index:${patients.indexOf(patient)}">
      <td class="patient-id-cell">${escapeHTML(patient.id)}</td>
      <td>${formatNumber(patient.arrival)} min</td>
      <td>${formatNumber(patient.duration)} min</td>
      <td><span class="urgency-pill urgency-${escapeHTML(patient.urgency)}">${escapeHTML(urgencyLabels[patient.urgency])}</span></td>
      <td><button class="remove-button" type="button" data-remove="${escapeHTML(patient.id)}" aria-label="Remove ${escapeHTML(patient.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6.5 7l.7 13h9.6l.7-13M9 7V4h6v3"/></svg></button></td>
    </tr>
  `).join("");
  queueEmpty.hidden = patients.length > 0;
  queueBody.parentElement.hidden = patients.length === 0;
  document.querySelector("#queue-count").textContent = `${patients.length} ${patients.length === 1 ? "patient" : "patients"}`;
  document.querySelector("#patient-count").textContent = String(patients.length);
}

function renderTimeline() {
  const timeline = document.querySelector("#timeline");
  const axis = document.querySelector("#timeline-axis");
  const legend = document.querySelector("#timeline-legend");
  const duration = schedule.length ? schedule[schedule.length - 1].end : 0;

  if (!schedule.length || duration <= 0) {
    timeline.innerHTML = "";
    axis.innerHTML = "";
    legend.innerHTML = '<span class="legend-empty">Add patients to see the planned care order.</span>';
    return;
  }

  timeline.innerHTML = schedule.map((segment, index) => {
    const width = ((segment.end - segment.start) / duration) * 100;
    if (segment.idle) {
      return `<div class="timeline-block idle-block" style="width:${width}%;--segment-index:${index}" title="No care planned: ${formatNumber(segment.start)}–${formatNumber(segment.end)} minutes"><span>NO CARE</span><small>${formatNumber(segment.start)}–${formatNumber(segment.end)}</small></div>`;
    }
    const color = colors[patients.findIndex((patient) => patient.id === segment.id) % colors.length];
    return `<div class="timeline-block" style="width:${width}%;background:${color};--segment-index:${index}" title="${escapeHTML(segment.id)}: ${formatNumber(segment.start)}–${formatNumber(segment.end)} minutes"><span>${escapeHTML(segment.id)}</span><small>${formatNumber(segment.start)}–${formatNumber(segment.end)}</small></div>`;
  }).join("");

  const tickCount = Math.min(6, Math.max(2, Math.ceil(duration) + 1));
  const ticks = Array.from({ length: tickCount }, (_, index) => {
    const value = duration * index / (tickCount - 1);
    return `<span>${formatNumber(value)}</span>`;
  });
  axis.innerHTML = ticks.join("");

  const seen = new Set();
  const legendItems = [];
  for (const segment of schedule) {
    if (segment.idle || seen.has(segment.id)) continue;
    seen.add(segment.id);
    const color = colors[patients.findIndex((patient) => patient.id === segment.id) % colors.length];
    legendItems.push(`<span class="legend-item"><i class="legend-swatch" style="background:${color}"></i>${escapeHTML(segment.id)}</span>`);
  }
  if (schedule.some((segment) => segment.idle)) {
    legendItems.push('<span class="legend-item"><i class="legend-swatch" style="background:#dce1e3"></i>No care planned</span>');
  }
  legend.innerHTML = legendItems.join("");
}

function calculateFcfsAverageWaiting() {
  const arrivalOrder = patients
    .map((patient, order) => ({ ...patient, order }))
    .sort((a, b) => a.arrival - b.arrival || a.order - b.order);
  let time = 0;
  let totalWaiting = 0;

  for (const patient of arrivalOrder) {
    const start = Math.max(time, patient.arrival);
    totalWaiting += start - patient.arrival;
    time = start + patient.duration;
  }

  return totalWaiting / arrivalOrder.length;
}

function renderPriorityImpact(averageWaiting) {
  const impactMessage = document.querySelector("#impact-message");
  const fcfsWait = document.querySelector("#fcfs-wait");
  const priorityWait = document.querySelector("#priority-wait");
  if (!patients.length) {
    impactMessage.textContent = "Add patients to compare urgency order with arrival order.";
    fcfsWait.textContent = "—";
    priorityWait.textContent = "—";
    return;
  }

  const baseline = calculateFcfsAverageWaiting();
  const difference = baseline - averageWaiting;
  fcfsWait.textContent = `${formatNumber(baseline)} min`;
  priorityWait.textContent = `${formatNumber(averageWaiting)} min`;
  if (difference > 0.005) {
    impactMessage.textContent = `Using urgency order, the average wait is ${formatNumber(difference)} minutes shorter than arrival order.`;
  } else if (difference < -0.005) {
    impactMessage.textContent = `Using urgency order, the average wait is ${formatNumber(Math.abs(difference))} minutes longer than arrival order.`;
  } else {
    impactMessage.textContent = "Urgency order and arrival order give the same average wait for this list.";
  }
}

function renderResults() {
  const exportButton = document.querySelector("#export-csv");
  exportButton.disabled = patients.length === 0;
  if (!patients.length) {
    resultsBody.innerHTML = "";
    resultsBody.parentElement.hidden = true;
    resultsEmpty.hidden = false;
    document.querySelector("#average-wait").innerHTML = `—<small>min</small>`;
    document.querySelector("#average-turnaround").innerHTML = `—<small>min</small>`;
    document.querySelector("#execution-label").textContent = "AWAITING PATIENTS";
    document.querySelector("#results-footnote").hidden = true;
    renderPriorityImpact(0);
    renderTimeline();
    return;
  }

  const completionById = new Map();
  for (const segment of schedule) {
    if (!segment.idle) completionById.set(segment.id, segment.end);
  }
  const rows = patients.map((patient) => {
    const completion = completionById.get(patient.id);
    const totalTime = completion - patient.arrival;
    const waiting = totalTime - patient.duration;
    return { ...patient, completion, totalTime, waiting };
  });
  const averageWaiting = rows.reduce((total, row) => total + row.waiting, 0) / rows.length;
  const averageTotalTime = rows.reduce((total, row) => total + row.totalTime, 0) / rows.length;

  resultsBody.innerHTML = rows.map((row, index) => `
    <tr style="--row-index:${index}">
      <td class="patient-id-cell">${escapeHTML(row.id)}</td>
      <td>${formatNumber(row.arrival)} min</td>
      <td>${formatNumber(row.duration)} min</td>
      <td><span class="urgency-pill urgency-${escapeHTML(row.urgency)}">${escapeHTML(urgencyLabels[row.urgency])}</span></td>
      <td class="completion-cell">${formatNumber(row.completion)} min</td>
      <td class="waiting-cell">${formatNumber(row.waiting)} min</td>
      <td class="turnaround-cell">${formatNumber(row.totalTime)} min</td>
    </tr>
  `).join("");
  resultsBody.parentElement.hidden = false;
  resultsEmpty.hidden = true;
  document.querySelector("#average-wait").innerHTML = `${formatNumber(averageWaiting)}<small>min</small>`;
  document.querySelector("#average-turnaround").innerHTML = `${formatNumber(averageTotalTime)}<small>min</small>`;
  document.querySelector("#execution-label").textContent = currentMode() === "preemptive" ? "URGENT ARRIVALS MOVE AHEAD" : "CURRENT CARE SLOT FINISHES";
  document.querySelector("#results-footnote").hidden = false;
  renderPriorityImpact(averageWaiting);
  renderTimeline();
}

function updateSchedule() {
  calculateSchedule();
  renderQueue();
  renderResults();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const id = String(data.get("patientId")).trim();
  const arrivalInput = String(data.get("arrivalTime")).trim();
  const durationInput = String(data.get("careDuration")).trim();
  const urgency = String(data.get("urgency"));
  const arrival = Number(arrivalInput);
  const duration = Number(durationInput);
  const idPattern = /^[a-zA-Z0-9_-]{1,12}$/;

  if (!idPattern.test(id)) {
    formMessage.textContent = "Enter a patient ID of 1–12 letters, numbers, hyphens, or underscores. Do not enter a name.";
    formMessage.className = "form-hint error";
    form.elements.patientId.focus();
    return;
  }
  if (patients.some((patient) => patient.id.toLowerCase() === id.toLowerCase())) {
    formMessage.textContent = "That patient ID is already in the queue.";
    formMessage.className = "form-hint error";
    form.elements.patientId.focus();
    return;
  }
  if (!arrivalInput || !Number.isFinite(arrival) || arrival < 0) {
    formMessage.textContent = "Arrival must be a number of minutes from shift start, greater than or equal to 0.";
    formMessage.className = "form-hint error";
    form.elements.arrivalTime.focus();
    return;
  }
  if (!durationInput || !Number.isFinite(duration) || duration <= 0) {
    formMessage.textContent = "Estimated care time must be a number of minutes greater than 0.";
    formMessage.className = "form-hint error";
    form.elements.careDuration.focus();
    return;
  }
  if (!Object.hasOwn(urgencyRank, urgency)) {
    formMessage.textContent = "Choose an urgency level assigned by qualified staff.";
    formMessage.className = "form-hint error";
    form.elements.urgency.focus();
    return;
  }

  patients.push({ id, arrival, duration, urgency });
  form.reset();
  formMessage.textContent = "Patient added. The care plan has been updated.";
  formMessage.className = "form-hint success";
  form.elements.patientId.focus();
  updateSchedule();
});

queueBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  patients = patients.filter((patient) => patient.id !== button.dataset.remove);
  formMessage.textContent = "Patient removed. Schedule recalculated.";
  formMessage.className = "form-hint";
  updateSchedule();
});

document.querySelector("#clear-queue").addEventListener("click", () => {
  patients = [];
  formMessage.textContent = "List cleared. Add patients to create a care plan.";
  formMessage.className = "form-hint";
  updateSchedule();
});

document.querySelector("#load-sample").addEventListener("click", () => {
  patients = samplePatients.map((patient) => ({ ...patient }));
  formMessage.textContent = "Example patient list loaded. The care plan has been updated.";
  formMessage.className = "form-hint success";
  updateSchedule();
});

document.querySelector("#run-schedule").addEventListener("click", updateSchedule);
document.querySelector("#export-csv").addEventListener("click", () => {
  if (!patients.length) return;

  const completionById = new Map();
  for (const segment of schedule) {
    if (!segment.idle) completionById.set(segment.id, segment.end);
  }
  const mode = currentMode() === "preemptive"
    ? "New higher-urgency arrivals move ahead"
    : "Finish current care slot first";
  const csvEscape = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const rows = [[
    "Patient ID",
    "Arrival (minutes from shift start)",
    "Estimated care time (minutes)",
    "Clinician-assigned urgency",
    "Estimated care complete (minutes from shift start)",
    "Estimated time before care (minutes)",
    "Estimated total time (minutes)",
    "Planned care slots (minutes)",
    "Care-order setting",
  ]];

  for (const patient of patients) {
    const completion = completionById.get(patient.id);
    const totalTime = completion - patient.arrival;
    const waiting = totalTime - patient.duration;
    const executionSegments = schedule
      .filter((segment) => segment.id === patient.id)
      .map((segment) => `${formatNumber(segment.start)}-${formatNumber(segment.end)}`)
      .join("; ");
    rows.push([
      patient.id,
      formatNumber(patient.arrival),
      formatNumber(patient.duration),
      urgencyLabels[patient.urgency],
      formatNumber(completion),
      formatNumber(waiting),
      formatNumber(totalTime),
      executionSegments,
      mode,
    ]);
  }

  const averageWaiting = patients.reduce((total, patient) => {
    const totalTime = completionById.get(patient.id) - patient.arrival;
    return total + totalTime - patient.duration;
  }, 0) / patients.length;
  const averageTurnaround = patients.reduce((total, patient) => {
    return total + completionById.get(patient.id) - patient.arrival;
  }, 0) / patients.length;
  rows.push(["AVERAGE", "", "", "", "", formatNumber(averageWaiting), formatNumber(averageTurnaround), "", mode]);

  const csv = `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `careline-care-plan-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

document.querySelectorAll('input[name="mode"]').forEach((input) => {
  input.addEventListener("change", () => {
    document.querySelector("#nonpreemptive-card").classList.toggle("selected", currentMode() === "nonpreemptive");
    document.querySelector("#preemptive-card").classList.toggle("selected", currentMode() === "preemptive");
    updateSchedule();
  });
});

updateSchedule();
