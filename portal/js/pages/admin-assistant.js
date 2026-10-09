import { rpc, uploadPdf, removeFiles } from '../api.js';
import { html, icon, toast, $, $$, dialog, problem } from '../ui.js';
import { programs, programOptions, options, onSubmit, fmtDate, fmtDateTime } from '../admin-kit.js';

export async function assistant(ctx) {
  // Check if user is admin (required for all assistant actions)
  if (!ctx.me || ctx.me.role !== 'admin') {
    return html`<section class="card empty"><b>Admin access required</b>This assistant is available only to administrators.</section>`;
  }

  const [progs] = await Promise.all([
    programs()
  ]);

  ctx.render(html`
    <header class="band"><div><p class="eyebrow">Admin</p><h1>Admin Assistant</h1>
      <p class="sub">Guided workflows for common administrative tasks</p></div>
    </header>
    <div class="content">
      <div class="grid3">
        <section class="card" aria-labelledby="h-pdf">
          <div class="cardhead"><h2 id="h-pdf">Upload PDF</h2><span class="small">Attach to lessons or projects</span></div>
          <div class="cardbody">
            <p>Upload PDF files for students to download from lessons or projects.</p>
            <button class="btn primary" id="btn-pdf-upload">Start PDF Upload</button>
          </div>
        </section>

        <section class="card" aria-labelledby="h-batch">
          <div class="cardhead"><h2 id="h-batch">Create Batch</h2><span class="small">Create a new batch for any program</span></div>
          <div class="cardbody">
            <p>Create a new batch with automatic session and assignment setup.</p>
            <button class="btn primary" id="btn-batch-create">Start Batch Creation</button>
          </div>
        </section>

        <section class="card" aria-labelledby="h-enroll">
          <div class="cardhead"><h2 id="h-enroll">Enroll Student</h2><span class="small">Enroll students into batches</span></div>
          <div class="cardbody">
            <p>Enroll students by email into existing or new batches.</p>
            <button class="btn primary" id="btn-enroll-student">Start Student Enrollment</button>
          </div>
        </section>
      </div>
    </div>
  `);

  // PDF Upload Handler
  const pdfBtn = $$('#btn-pdf-upload', ctx.main)[0];
  if (pdfBtn) {
    pdfBtn.addEventListener('click', async () => {
      await handlePdfUpload(ctx);
    });
  }

  // Batch Creation Handler
  const batchBtn = $$('#btn-batch-create', ctx.main)[0];
  if (batchBtn) {
    batchBtn.addEventListener('click', async () => {
      await handleBatchCreation(ctx);
    });
  }

  // Student Enrollment Handler
  const enrollBtn = $$('#btn-enroll-student', ctx.main)[0];
  if (enrollBtn) {
    enrollBtn.addEventListener('click', async () => {
      await handleStudentEnrollment(ctx);
    });
  }
}

// Handle PDF Upload workflow
async function handlePdfUpload(ctx) {
  // Step 1: Select program and term
  const { value: programId } = await dialog({
    title: 'Select Program',
    label: 'Program',
    html: `<select id="prog-select">${programOptions(progs)}</select>`,
    confirm: 'Continue',
    cancel: true
  });
  if (!programId) return;

  const termOptions = [
    ['0', 'All terms'],
    ...Array.from({ length: 12 }, (_, i) => [String(i + 1), `Term ${i + 1}`])
  ];
  const { value: termNo } = await dialog({
    title: 'Select Term',
    label: 'Term',
    html: `<select id="term-select">${options(termOptions, '0')}</select>`,
    confirm: 'Continue',
    cancel: true
  });
  if (termNo === null) return;

  // Step 2: Select target (lesson/project)
  const targetOptions = await getTargetOptions(ctx, programId, termNo);
  if (!targetOptions.length) {
    toast('No lessons or projects found for this term.');
    return;
  }

  const { value: targetValue } = await dialog({
    title: 'Select Target',
    label: 'Attach to',
    html: `<select id="target-select">${targetOptions.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}</select>`,
    confirm: 'Continue',
    cancel: true
  });
  if (!targetValue) return;

  const [kind, id] = targetValue.split(':');

  // Step 3: Get PDF details
  const { value: title } = await dialog({
    title: 'PDF Details',
    label: 'Title students see',
    html: `<input id="title-input" type="text" maxlength="120" placeholder="e.g. Lecture notes · Week 1">`,
    confirm: 'Continue',
    cancel: true
  });
  if (!title) return;

  // Step 4: File selection
  const { value: file } = await dialog({
    title: 'Select PDF File',
    label: 'PDF file',
    html: `<input id="file-input" type="file" accept="application/pdf,.pdf">`,
    confirm: 'Upload',
    cancel: true
  });
  if (!file) return;

  // Validation
  if (!title.trim()) {
    await dialog({ title: 'Error', html: '<p>Please give the PDF a title.</p>', confirm: 'OK' });
    return;
  }

  // Check file size and type (basic check)
  if (file.size > 50 * 1024 * 1024) { // 50MB
    await dialog({ title: 'Error', html: '<p>File too large. Maximum size is 50 MB.</p>', confirm: 'OK' });
    return;
  }

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    await dialog({ title: 'Error', html: '<p>Please select a PDF file.</p>', confirm: 'OK' });
    return;
  }

  // Confirmation preview
  const targetLabel = targetOptions.find(opt => opt.value === targetValue)?.label || targetValue;
  const confirmHtml = html`
    <p>Ready to upload PDF:</p>
    <ul>
      <li><strong>Title:</strong> ${title.trim()}</li>
      <li><strong>Target:</strong> ${targetLabel}</li>
      <li><strong>File:</strong> ${file.name} (${formatBytes(file.size)})</li>
    </ul>
    <p>This file will be available for download in the student portal.</p>
  `;

  const confirmed = await dialog({
    title: 'Confirm Upload',
    html: confirmHtml,
    confirm: 'Upload PDF',
    cancel: true,
    danger: false
  });

  if (!confirmed) return;

  // Perform upload
  try {
    const path = await uploadPdfToStorage(ctx, programId, kind, id, title, file);
    await attachPdfToTarget(ctx, programId, kind, id, path, title);
    await ctx.refresh();
    toast(`“${title}” uploaded successfully. Students can now download it.`);
  } catch (err) {
    toast(`Upload failed: ${err.message}`);
  }
}

// Handle Batch Creation workflow
async function handleBatchCreation(ctx) {
  // Step 1: Select program
  const { value: programId } = await dialog({
    title: 'Select Program',
    label: 'Program',
    html: `<select id="prog-select">${programOptions(progs)}</select>`,
    confirm: 'Continue',
    cancel: true
  });
  if (!programId) return;

  // Get program details
  const program = progs.find(p => p.id === programId);
  if (!program) {
    await dialog({ title: 'Error', html: '<p>Program not found.</p>', confirm: 'OK' });
    return;
  }

  // Step 2: Select start date
  const today = new Date();
  const minDate = today.toISOString().split('T')[0];
  const { value: startDate } = await dialog({
    title: 'Select Start Date',
    label: 'Starts on (a Monday)',
    html: `<input id="date-input" type="date" min="${minDate}">`,
    confirm: 'Continue',
    cancel: true
  });
  if (!startDate) return;

  // Validate it's a Monday
  const date = new Date(startDate);
  if (date.getDay() !== 1) { // 0 = Sunday, 1 = Monday
    await dialog({
      title: 'Error',
      html: '<p>Batches start on a Monday. Please select a Monday.</p>',
      confirm: 'OK'
    });
    return;
  }

  // Step 3: Select term (optional, defaults to program's term count)
  const termOptions = [
    ['0', 'Full program (all terms)'],
    ...Array.from({ length: program.terms }, (_, i) => [String(i + 1), `Term ${i + 1}`])
  ];
  const { value: termCountStr } = await dialog({
    title: 'Select Term Count',
    label: 'Number of terms',
    html: `<select id="term-count-select">${options(termOptions, String(program.terms))}</select>`,
    confirm: 'Continue',
    cancel: true
  });
  if (termCountStr === null) return;
  const termCount = parseInt(termCountStr, 10);

  // Generate preview
  const batchCode = generateBatchCode(program.id, startDate);
  const endDate = new Date(date);
  endDate.setDate(endDate.getDate() + (termCount * program.duration_weeks * 7) - 1);

  const confirmHtml = html`
    <p>Ready to create batch:</p>
    <ul>
      <li><strong>Program:</strong> ${program.name} (${program.level})</li>
      <li><strong>Batch Code:</strong> ${batchCode}</li>
      <li><strong>Starts:</strong> ${fmtDate(startDate)} (Monday)</li>
      <li><strong>Ends:</strong> ${fmtDate(endDate.toISOString().split('T')[0])}</li>
      <li><strong>Terms:</strong> ${termCount}</li>
      <li><strong>Weeks per term:</strong> ${program.duration_weeks}</li>
      <li><strong>Total weeks:</strong> ${termCount * program.duration_weeks}</li>
      <li><strong>Capacity:</strong> ${program.capacity} students</li>
    </ul>
    <p>This batch will be created in 'scheduled' status and activated automatically on the start date.</p>
  `;

  const confirmed = await dialog({
    title: 'Confirm Batch Creation',
    html: confirmHtml,
    confirm: 'Create Batch',
    cancel: true
  });

  if (!confirmed) return;

  // Create batch
  try {
    const batchId = await rpc('admin_create_batch', {
      p_program: programId,
      p_starts_on: startDate,
      p_term: termCount
    });

    await ctx.refresh();
    toast(`Batch ${batchCode} created successfully! It will become active on ${fmtDate(startDate)}.`);
  } catch (err) {
    toast(`Batch creation failed: ${err.message}`);
  }
}

// Handle Student Enrollment workflow
async function handleStudentEnrollment(ctx) {
  // Step 1: Find student by email
  const { value: email } = await dialog({
    title: 'Find Student',
    label: 'Student email',
    html: `<input id="email-input" type="email" placeholder="student@example.com">`,
    confirm: 'Search',
    cancel: true
  });
  if (!email) return;

  try {
    const students = await rpc('admin_students', { p_search: email, p_limit: 1 });
    if (!students || students.length === 0) {
      await dialog({
        title: 'Error',
        html: `<p>No account found with email: ${email}</p><p>Ask them to sign up first, then try again.</p>`,
        confirm: 'OK'
      });
      return;
    }
    const student = students[0];
  } catch (err) {
    await dialog({
      title: 'Error',
      html: `<p>Error searching for student: ${err.message}</p>`,
      confirm: 'OK'
    });
    return;
  }

  // Step 2: Select program
  const { value: programId } = await dialog({
    title: 'Select Program',
    label: 'Program',
    html: `<select id="prog-select">${programOptions(progs)}</select>`,
    confirm: 'Continue',
    cancel: true
  });
  if (!programId) return;

  const program = progs.find(p => p.id === programId);
  if (!program) {
    await dialog({ title: 'Error', html: '<p>Program not found.</p>', confirm: 'OK' });
    return;
  }

  // Step 3: Select batch option
  const batchOptions = [
    ['existing', 'Use existing batch'],
    ['new', 'Create new batch']
  ];
  const { value: batchOption } = await dialog({
    title: 'Batch Selection',
    label: 'Batch option',
    html: `<select id="batch-option-select">${options(batchOptions, 'existing')}</select>`,
    confirm: 'Continue',
    cancel: true
  });
  if (batchOption === null) return;

  let batchId = null;
  let batchCode = null;
  let batchStartDate = null;

  if (batchOption === 'existing') {
    // Get existing batches for this program (scheduled or active)
    const batches = await rpc('admin_batches', {
      p_program: programId,
      p_status: null // null means all statuses, we'll filter below
    });
    const activeBatches = batches.filter(b => ['scheduled', 'active'].includes(b.status));
    if (!activeBatches.length) {
      await dialog({
        title: 'Error',
        html: `<p>No active or scheduled batches found for this program.</p><p>Please create a new batch instead.</p>`,
        confirm: 'OK'
      });
      return;
    }

    const batchSelectOptions = activeBatches.map(b => [
      b.id,
      `${b.code} · ${fmtDate(b.starts_on)} to ${fmtDate(b.ends_on)} (${b.enrolled.active}/${b.capacity} enrolled)`
    ]);
    const { value: selectedBatchId } = await dialog({
      title: 'Select Batch',
      label: 'Existing batch',
      html: `<select id="batch-select">${batchSelectOptions.map(opt => `<option value="${opt[0]}">${opt[1]}</option>`).join('')}</select>`,
      confirm: 'Continue',
      cancel: true
    });
    if (!selectedBatchId) return;

    const selectedBatch = activeBatches.find(b => b.id === selectedBatchId);
    batchId = selectedBatch.id;
    batchCode = selectedBatch.code;
    batchStartDate = selectedBatch.starts_on;
  } else {
    // Create new batch
    const today = new Date();
    const minDate = today.toISOString().split('T')[0];
    const { value: startDate } = await dialog({
      title: 'Batch Start Date',
      label: 'Starts on (a Monday)',
      html: `<input id="date-input" type="date" min="${minDate}">`,
      confirm: 'Continue',
      cancel: true
    });
    if (!startDate) return;

    const date = new Date(startDate);
    if (date.getDay() !== 1) {
      await dialog({
        title: 'Error',
        html: '<p>Batches start on a Monday. Please select a Monday.</p>',
        confirm: 'OK'
      });
      return;
    }

    batchId = await rpc('admin_create_batch', {
      p_program: programId,
      p_starts_on: startDate,
      p_term: 1 // Default to 1 term for enrollment
    });

    // Read the new batch back from the program's batch list (there is no single-batch admin function).
    const batches = await rpc('admin_batches', { p_program: programId, p_status: null });
    const newBatch = (batches || []).find((b) => b.id === batchId);
    if (newBatch) {
      batchCode = newBatch.code;
      batchStartDate = newBatch.starts_on;
    } else {
      // Last resort: generate code and use the input date
      batchCode = generateBatchCode(programId, startDate);
      batchStartDate = startDate;
    }
  }

  // Confirmation preview
  const confirmHtml = html`
    <p>Ready to enroll student:</p>
    <ul>
      <li><strong>Student:</strong> ${student.name || student.email} (${student.email})</li>
      <li><strong>Program:</strong> ${program.name}</li>
      <li><strong>Batch:</strong> ${batchCode}</li>
      <li><strong>Starts:</strong> ${fmtDate(batchStartDate)}</li>
      <li><strong>Source:</strong> Admin</li>
    </ul>
    <p>Student will receive a welcome notification and gain immediate access to batch materials.</p>
  `;

  const confirmed = await dialog({
    title: 'Confirm Enrollment',
    html: confirmHtml,
    confirm: 'Enroll Student',
    cancel: true
  });

  if (!confirmed) return;

  // Enroll student
  try {
    await rpc('admin_enroll', {
      p_email: email,
      p_program: programId,
      p_starts_on: batchStartDate
    });

    await ctx.refresh();
    toast(`${student.name || student.email} successfully enrolled in batch ${batchCode}!`);
  } catch (err) {
    toast(`Enrollment failed: ${err.message}`);
  }
}

// Helper functions
async function getTargetOptions(ctx, programId, termNo) {
  try {
    const outline = await rpc('admin_program_outline', { p_program: programId });
    const terms = outline.terms.filter(t => (!termNo || t.term === termNo) && (t.lessons.length || t.projects.length));

    const options = [];
    terms.forEach(term => {
      term.lessons.forEach(lesson => {
        options.push({
          value: `lesson:${lesson.id}`,
          label: `Term ${term.term}: ${lesson.code} · ${lesson.title}`
        });
      });
      term.projects.forEach(project => {
        options.push({
          value: `project:${project.id}`,
          label: `Term ${term.term}: Project · ${project.title}`
        });
      });
    });
    return options;
  } catch (err) {
    console.error('Error getting target options:', err);
    return [];
  }
}

async function uploadPdfToStorage(ctx, programId, kind, id, title, file) {
  const folder = kind === 'lesson' ? `lessons` : `assignments`;
  const fileName = `${file.name.replace(/\.pdf$/i, '')}-${Date.now()}.pdf`;
  const path = `${programId}/${folder}/${fileName}`;

  await uploadPdf(path, file);
  return path;
}

async function attachPdfToTarget(ctx, programId, kind, id, path, title) {
  const lessonId = kind === 'lesson' ? id : null;
  const assignmentId = kind === 'project' ? id : null;

  await rpc('admin_add_material', {
    p_file_path: path,
    p_title: title,
    p_lesson: lessonId,
    p_assignment_template: assignmentId
  });
}

function generateBatchCode(programId, startDate) {
  const prog = progs.find(p => p.id === programId);
  if (!prog) return 'ERR';

  const date = new Date(startDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const prefix = prog.id.replace(/-/g, '').toUpperCase();
  return `${prefix}-${year}-${month}`;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}