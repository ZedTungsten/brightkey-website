(() => {
  'use strict';

  const GENERAL_KEY = 'hr_onboarding_handbook_files';
  const JOB_KEY = 'hr_onboarding_job_materials';
  const state = { sb: null, companyId: null, general: [], byJob: {}, jobs: [], selectedJobId: '', modalScope: 'general', editingId: '', deleteScope: '', deleteId: '', dragged: null, saving: false, viewerFiles: [], viewerIndex: -1 };
  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const showToast = (message, isError = false) => window.Toast ? window.Toast.show(message, isError ? 'error' : 'success') : console[isError ? 'error' : 'log'](message);

  function driveIcon() { return `<svg viewBox="0 0 87.3 78" aria-hidden="true"><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47"/><path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/><path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/><path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/><path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/></svg>`; }
  function dragHandle(scope, file) { return `<span class="hr-material-drag-handle" role="button" tabindex="0" draggable="true" title="Drag to reorder" aria-label="Reorder ${esc(file.name)}" ondragstart="HRMaterials.dragStart(event,'${scope}','${esc(file.id)}')" ondragend="HRMaterials.dragEnd()"><svg viewBox="0 0 12 18" aria-hidden="true"><circle cx="3" cy="3" r="1.4"/><circle cx="9" cy="3" r="1.4"/><circle cx="3" cy="9" r="1.4"/><circle cx="9" cy="9" r="1.4"/><circle cx="3" cy="15" r="1.4"/><circle cx="9" cy="15" r="1.4"/></svg></span>`; }
  function linkButton(scope) { return `<button class="btn btn-primary hr-handbook-link-button" type="button" onclick="HRMaterials.openModal('${scope}')">${driveIcon()}Link File</button>`; }
  function materialGroup(file) { return String(file?.group || '').trim() || 'Ungrouped'; }
  function groupNames(files) { return [...new Set(files.map(materialGroup))]; }
  function groupOptions(files, selected = 'Ungrouped') { const groups=groupNames(files);if(!groups.includes(selected))groups.push(selected);return groups.map(group => `<option value="${esc(group)}"${group === selected ? ' selected' : ''}>${esc(group)}</option>`).join(''); }
  function rows(files, scope) {
    if (!files.length) return `<div class="hr-handbook-empty">No ${scope === 'general' ? 'general' : 'job-post-specific'} materials have been linked yet.</div>`;
    const groupBodies = groupNames(files).map(group => {
      const encodedGroup = encodeURIComponent(group).replace(/'/g,'%27');
      const groupFiles = files.filter(file => materialGroup(file) === group);
      const fileRows = groupFiles.map(file => `<tr data-material-id="${esc(file.id)}" ondragover="HRMaterials.dragOver(event,'${scope}','${esc(file.id)}')" ondrop="HRMaterials.drop(event,'${scope}','${esc(file.id)}')"><td class="hr-material-order-column">${dragHandle(scope,file)}</td><td><button class="hr-handbook-name" type="button" onclick="HRMaterials.openViewer('${scope}','${esc(file.id)}')">${esc(file.name)}</button></td><td>${esc(group)}</td><td>${file.source === 'youtube' ? 'YouTube' : 'Google Drive'}</td><td>${esc(file.file_type)}</td><td><div class="hr-handbook-actions"><a href="${esc(file.file_url)}" target="_blank" rel="noopener noreferrer" title="Open external link" aria-label="Open ${esc(file.name)} externally"><svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg></a><button type="button" onclick="HRMaterials.openModal('${scope}','${esc(file.id)}')" title="Edit material" aria-label="Edit ${esc(file.name)}"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="hr-material-delete" type="button" onclick="HRMaterials.openDelete('${scope}','${esc(file.id)}')" title="Delete material" aria-label="Delete ${esc(file.name)}"><svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg></button></div></td></tr>`).join('');
      return `<tbody class="hr-material-group" data-group="${esc(group)}"><tr class="hr-material-group-header" ondragover="HRMaterials.dragOverGroup(event,'${scope}')" ondrop="HRMaterials.dropGroup(event,'${scope}','${esc(encodedGroup)}')"><td colspan="6"><span>${esc(group)}</span><small>${groupFiles.length} ${groupFiles.length === 1 ? 'file' : 'files'}</small></td></tr>${fileRows}</tbody>`;
    }).join('');
    return `<div class="hr-handbook-table-wrap"><table class="hr-handbook-table"><colgroup><col class="hr-material-order-col"><col class="hr-material-name-col"><col class="hr-material-group-col"><col class="hr-material-source-col"><col class="hr-material-type-col"><col class="hr-material-actions-col"></colgroup><thead><tr><th class="hr-material-order-column" aria-label="Order"></th><th>Name</th><th>Group</th><th>Source</th><th>File Type</th><th>Actions</th></tr></thead>${groupBodies}</table></div>`;
  }
  function modalMarkup() {
    return `<div class="hr-handbook-modal" id="hr-handbook-modal" role="dialog" aria-modal="true" aria-labelledby="hr-material-modal-title" style="display:none"><div class="hr-handbook-modal-card"><header class="hr-handbook-modal-header"><h2 id="hr-material-modal-title">Link File</h2><button type="button" onclick="HRMaterials.closeModal()" aria-label="Close link modal"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header><div class="hr-handbook-form-group"><label for="material-source">Resource Type</label><select id="material-source" onchange="HRMaterials.changeSource(this.value)"><option value="gdrive">Google Drive Link</option><option value="youtube">YouTube Link</option></select></div><div class="hr-handbook-form-group"><label for="material-name">Resource Name</label><input id="material-name" type="text" maxlength="120" placeholder="e.g. Welcome Guide" /></div><div class="hr-handbook-form-group"><label for="material-group">Group</label><select id="material-group" onchange="HRMaterials.changeGroup(this.value)"></select></div><div class="hr-handbook-form-group" id="material-new-group-wrap" style="display:none"><label for="material-new-group">New Group Name</label><input id="material-new-group" type="text" maxlength="80" placeholder="e.g. Company Essentials" /></div><div class="hr-handbook-form-group"><label for="material-url" id="material-url-label">Google Drive Link</label><input id="material-url" type="url" placeholder="https://drive.google.com/file/d/.../view or Google Docs link" /></div><div class="hr-handbook-form-group" id="material-file-type-group"><label for="material-file-type">File Type</label><select id="material-file-type"><option value="" disabled selected hidden>Select file type</option><option value="doc">Document</option><option value="sheet">Sheet</option><option value="slide">Slide</option><option value="pdf">PDF</option><option value="image">Image</option><option value="video">Video</option></select></div><footer class="hr-handbook-modal-footer"><button class="btn btn-outline" type="button" onclick="HRMaterials.closeModal()">Cancel</button><button class="btn btn-primary" id="material-save" type="button" onclick="HRMaterials.saveFile()">Link File</button></footer></div></div>`;
  }
  function deleteMarkup() { return `<div class="hr-handbook-modal" id="hr-material-delete-modal" role="dialog" aria-modal="true" aria-labelledby="hr-material-delete-title" style="display:none"><div class="hr-handbook-modal-card"><header class="hr-handbook-modal-header"><h2 id="hr-material-delete-title">Delete Material?</h2><button type="button" onclick="HRMaterials.closeDelete()" aria-label="Close delete confirmation"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header><p class="hr-material-delete-copy">This will remove <strong id="hr-material-delete-name"></strong> from employee onboarding.</p><footer class="hr-handbook-modal-footer"><button class="btn btn-outline" type="button" onclick="HRMaterials.closeDelete()">Cancel</button><button class="btn hr-material-delete-confirm" id="hr-material-delete-confirm" type="button" onclick="HRMaterials.deleteFile()">Delete</button></footer></div></div>`; }
  function viewerMarkup() { return `<div class="hr-handbook-viewer" id="hr-material-viewer" role="dialog" aria-modal="true" aria-labelledby="hr-material-viewer-title" style="display:none"><header class="hr-handbook-viewer-header"><span id="hr-material-viewer-title">File Viewer</span><div id="hr-handbook-viewer-link"></div><button type="button" onclick="HRMaterials.closeViewer()" aria-label="Close viewer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header><div class="hr-handbook-viewer-body" id="hr-material-viewer-body"></div><button class="hr-handbook-viewer-nav previous" id="hr-material-previous" onclick="HRMaterials.navigateViewer(-1)" aria-label="Previous material"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><button class="hr-handbook-viewer-nav next" id="hr-material-next" onclick="HRMaterials.navigateViewer(1)" aria-label="Next material"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button></div>`; }
  function render() {
    const host = document.getElementById('hr-onboarding-content'); if (!host) return;
    const jobFiles = state.selectedJobId ? state.byJob[state.selectedJobId] || [] : [];
    const options = state.jobs.map(job => `<option value="${esc(job.id)}"${job.id === state.selectedJobId ? ' selected' : ''}>${esc(job.job_title)}</option>`).join('');
    host.innerHTML = `<div class="hr-materials-stack"><section class="hr-handbook-panel"><header class="hr-handbook-panel-header"><div><h2>General Materials</h2><p>Shown to all employees.</p></div>${linkButton('general')}</header>${rows(state.general,'general')}</section><section class="hr-handbook-panel"><header class="hr-handbook-panel-header hr-job-materials-header"><div><h2>Job Post Specific</h2><p>Shown only to employees assigned to the selected job post.</p></div><div class="hr-job-material-controls"><select aria-label="Select job post" onchange="HRMaterials.selectJob(this.value)"><option value="" disabled${state.selectedJobId ? '' : ' selected'}>Select job post</option>${options}</select>${linkButton('job')}</div></header>${state.selectedJobId ? rows(jobFiles,'job') : '<div class="hr-handbook-empty">Select a job post to manage its materials.</div>'}</section></div>${modalMarkup()}${deleteMarkup()}${viewerMarkup()}`;
  }

  function selectJob(value) { state.selectedJobId = value; render(); }
  function openModal(scope, id = '') {
    if (scope === 'job' && !state.selectedJobId) return showToast('Select a job post before linking a file.', true);
    state.modalScope = scope;
    state.editingId = id;
    const file = id ? currentFiles(scope).find(item => item.id === id) : null;
    if (id && !file) return showToast('This material could not be found. Refresh the page and try again.', true);
    document.getElementById('hr-material-modal-title').textContent = file ? 'Edit Material' : 'Link File';
    document.getElementById('material-save').textContent = file ? 'Save Changes' : 'Link File';
    document.getElementById('material-source').value = file?.source || 'gdrive';
    document.getElementById('material-name').value = file?.name || '';
    document.getElementById('material-url').value = file?.file_url || '';
    document.getElementById('material-file-type').value = file?.source === 'youtube' ? '' : file?.file_type || '';
    const selectedGroup = materialGroup(file);
    const groupSelect = document.getElementById('material-group');
    groupSelect.innerHTML = `${groupOptions(currentFiles(scope), selectedGroup)}<option value="__new__">Create New Group...</option>`;
    groupSelect.value = selectedGroup;
    document.getElementById('material-new-group').value = '';
    changeGroup(selectedGroup);
    changeSource(file?.source || 'gdrive');
    const modal=document.getElementById('hr-handbook-modal'); modal.style.display='flex'; void modal.offsetHeight; modal.classList.add('open');
  }
  function closeModal() { const modal=document.getElementById('hr-handbook-modal'); modal?.classList.remove('open'); setTimeout(()=>{if(modal)modal.style.display='none';},150); }
  function changeSource(source) { const youtube=source==='youtube'; document.getElementById('material-url-label').textContent=youtube?'YouTube Link':'Google Drive Link'; document.getElementById('material-url').placeholder=youtube?'https://www.youtube.com/watch?v=...':'https://drive.google.com/file/d/.../view or Google Docs link'; document.getElementById('material-file-type-group').style.display=youtube?'none':'flex'; }
  function changeGroup(value) { const wrap=document.getElementById('material-new-group-wrap');if(wrap)wrap.style.display=value==='__new__'?'flex':'none';if(value==='__new__')document.getElementById('material-new-group')?.focus(); }
  function normalizeUrl(value) { let url=String(value||'').trim(); if(url.toLowerCase().startsWith('<iframe'))url=url.match(/src=["']([^"']+)["']/i)?.[1]||''; return url; }
  function validDrive(url) { try { const parsed=new URL(url); return parsed.protocol==='https:'&&['drive.google.com','docs.google.com'].includes(parsed.hostname.toLowerCase()); } catch{return false;} }
  function validYoutube(url) { try { const host=new URL(url).hostname.toLowerCase().replace(/^www\./,''); return ['youtube.com','m.youtube.com','youtu.be'].includes(host); } catch{return false;} }
  function driveFolder(url) { return /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\//i.test(url); }
  function youtubeEmbed(url) { const parsed=new URL(url); const host=parsed.hostname.replace(/^www\./,''); const id=host==='youtu.be'?parsed.pathname.slice(1):parsed.searchParams.get('v')||parsed.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1]; return id?`https://www.youtube.com/embed/${id}`:url; }
  function driveEmbed(file) { const url=file.file_url; if(file.file_type==='doc'){if(url.includes('/edit'))return url.replace(/\/edit.*$/,'/preview?rm=minimal');return url.includes('/preview')?url:`${url.replace(/\/+$/,'')}/preview?rm=minimal`;} if(['slide','sheet'].includes(file.file_type))return url.replace(/\/edit.*$/,'/preview'); const id=url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1]; return id?`https://drive.google.com/file/d/${id}/preview`:url; }
  function currentFiles(scope=state.modalScope) { return scope==='general'?state.general:(state.byJob[state.selectedJobId]||[]); }
  async function persist() { return state.sb.from('global_settings').upsert([{company_id:state.companyId,key:GENERAL_KEY,value:state.general},{company_id:state.companyId,key:JOB_KEY,value:state.byJob}],{onConflict:'company_id,key'}); }
  function dragStart(event, scope, id) { state.dragged={scope,id}; event.dataTransfer.effectAllowed='move'; event.dataTransfer.setData('text/plain',id); }
  function dragOver(event, scope, id) { if(state.dragged?.scope!==scope||state.dragged.id===id)return; event.preventDefault(); event.dataTransfer.dropEffect='move'; }
  function dragOverGroup(event, scope) { if(state.dragged?.scope!==scope)return;event.preventDefault();event.dataTransfer.dropEffect='move';event.currentTarget.classList.add('dragover'); }
  function dragEnd() { state.dragged=null;document.querySelectorAll('.hr-material-group-header.dragover').forEach(row=>row.classList.remove('dragover')); }
  async function saveReorder(scope, previousGeneral, previousByJob) {
    render();state.saving=true;const {error}=await persist();state.saving=false;
    if(error){state.general=previousGeneral;state.byJob=previousByJob;render();console.error('Material order save failed:',error);showToast('The material group or order could not be saved. Please try again.',true);return false;}
    showToast('Material group and order saved.');return true;
  }
  async function drop(event, scope, targetId) {
    event.preventDefault();
    const dragged=state.dragged; state.dragged=null;
    if(!dragged||dragged.scope!==scope||dragged.id===targetId||state.saving)return;
    const previousGeneral=structuredClone(state.general), previousByJob=structuredClone(state.byJob), files=currentFiles(scope);
    const from=files.findIndex(file=>file.id===dragged.id), to=files.findIndex(file=>file.id===targetId);
    if(from<0||to<0)return;
    const targetGroup=materialGroup(files[to]);
    const [moved]=files.splice(from,1);moved.group=targetGroup;const adjustedTo=files.findIndex(file=>file.id===targetId);files.splice(adjustedTo,0,moved);if(scope==='job')state.byJob[state.selectedJobId]=files;
    await saveReorder(scope,previousGeneral,previousByJob);
  }
  async function dropGroup(event,scope,encodedGroup) {
    event.preventDefault();event.currentTarget.classList.remove('dragover');
    const dragged=state.dragged;state.dragged=null;if(!dragged||dragged.scope!==scope||state.saving)return;
    const group=decodeURIComponent(encodedGroup),previousGeneral=structuredClone(state.general),previousByJob=structuredClone(state.byJob),files=currentFiles(scope);
    const from=files.findIndex(file=>file.id===dragged.id);if(from<0)return;
    const [moved]=files.splice(from,1);moved.group=group;const lastGroupIndex=files.reduce((last,file,index)=>materialGroup(file)===group?index:last,-1);files.splice(lastGroupIndex+1,0,moved);if(scope==='job')state.byJob[state.selectedJobId]=files;
    await saveReorder(scope,previousGeneral,previousByJob);
  }
  async function saveFile() {
    if(state.saving)return; const source=document.getElementById('material-source').value; const name=document.getElementById('material-name').value.trim(); const url=normalizeUrl(document.getElementById('material-url').value); const type=source==='youtube'?'youtube':document.getElementById('material-file-type').value;const groupChoice=document.getElementById('material-group').value;const group=(groupChoice==='__new__'?document.getElementById('material-new-group').value:groupChoice).trim();
    if(!name)return showToast('Please specify a name for this resource.',true); if(!url)return showToast(source==='youtube'?'Please provide a YouTube link.':'Please provide a Google Drive sharing URL or embed code.',true); if(source==='youtube'&&!validYoutube(url))return showToast('Please enter a YouTube or youtu.be link.',true); if(source==='gdrive'&&!validDrive(url))return showToast('Please enter a valid Google Drive file link.',true); if(source==='gdrive'&&driveFolder(url))return showToast('This is a Google Drive folder link. Open the individual file and copy its file link instead.',true); if(!type)return showToast('Please select the Google Drive file type.',true);
    if(!group)return showToast('Please select an existing group or enter a new group name.',true);
    const previousGeneral=structuredClone(state.general), previousByJob=structuredClone(state.byJob); const target=currentFiles(); const record={id:state.editingId||crypto.randomUUID?.()||`${Date.now()}`,name:name.slice(0,120),group:group.slice(0,80),source,file_type:type,file_url:url,updated_at:new Date().toISOString()}; const editingIndex=state.editingId?target.findIndex(file=>file.id===state.editingId):-1; if(editingIndex>=0)target[editingIndex]=record;else target.push(record); if(state.modalScope==='job')state.byJob[state.selectedJobId]=target;
    state.saving=true; const {error}=await persist(); state.saving=false; if(error){state.general=previousGeneral;state.byJob=previousByJob;console.error('Material save failed:',error);return showToast(`The material could not be ${state.editingId?'updated':'linked'}. Please try again.`,true);} const wasEditing=Boolean(state.editingId); closeModal();render();showToast(wasEditing?'Material updated.':source==='youtube'?'YouTube link saved.':'Google Drive link saved.');
  }
  function openDelete(scope,id) {
    const file=currentFiles(scope).find(item=>item.id===id);
    if(!file)return showToast('This material could not be found. Refresh the page and try again.',true);
    state.deleteScope=scope;state.deleteId=id;
    document.getElementById('hr-material-delete-name').textContent=file.name;
    const modal=document.getElementById('hr-material-delete-modal');modal.style.display='flex';void modal.offsetHeight;modal.classList.add('open');
  }
  function closeDelete() { const modal=document.getElementById('hr-material-delete-modal');modal?.classList.remove('open');setTimeout(()=>{if(modal)modal.style.display='none';},150);state.deleteScope='';state.deleteId=''; }
  async function deleteFile() {
    if(state.saving||!state.deleteId)return;
    const previousGeneral=structuredClone(state.general),previousByJob=structuredClone(state.byJob),files=currentFiles(state.deleteScope);
    const index=files.findIndex(file=>file.id===state.deleteId);
    if(index<0){closeDelete();return showToast('This material could not be found. Refresh the page and try again.',true);}
    files.splice(index,1);if(state.deleteScope==='job')state.byJob[state.selectedJobId]=files;
    const button=document.getElementById('hr-material-delete-confirm');if(button){button.disabled=true;button.textContent='Deleting...';}
    state.saving=true;const {error}=await persist();state.saving=false;
    if(error){state.general=previousGeneral;state.byJob=previousByJob;if(button){button.disabled=false;button.textContent='Delete';}console.error('Material delete failed:',error);return showToast('The material could not be deleted. Please try again.',true);}
    closeDelete();render();showToast('Material deleted.');
  }
  function showViewer() { const file=state.viewerFiles[state.viewerIndex];if(!file)return;document.getElementById('hr-material-viewer-title').textContent=file.name;document.getElementById('hr-handbook-viewer-link').innerHTML=`<a href="${esc(file.file_url)}" target="_blank" rel="noopener noreferrer">Open External Link</a>`;document.getElementById('hr-material-viewer-body').innerHTML=`<iframe src="${esc(file.source==='youtube'?youtubeEmbed(file.file_url):driveEmbed(file))}" title="${esc(file.name)}" allowfullscreen></iframe>`;document.getElementById('hr-material-previous').style.display=state.viewerIndex>0?'flex':'none';document.getElementById('hr-material-next').style.display=state.viewerIndex<state.viewerFiles.length-1?'flex':'none'; }
  function openViewer(scope,id){state.viewerFiles=currentFiles(scope);state.viewerIndex=state.viewerFiles.findIndex(file=>file.id===id);if(state.viewerIndex<0)return;showViewer();document.getElementById('hr-material-viewer').style.display='flex';}
  function closeViewer(){document.getElementById('hr-material-viewer').style.display='none';document.getElementById('hr-material-viewer-body').innerHTML='';}
  function navigateViewer(direction){const index=state.viewerIndex+direction;if(index<0||index>=state.viewerFiles.length)return;state.viewerIndex=index;showViewer();}
  async function init(event){state.sb=event.detail.sb;state.companyId=event.detail.companyId;const [settingsResult,jobsResult]=await Promise.all([state.sb.from('global_settings').select('key,value').eq('company_id',state.companyId).in('key',[GENERAL_KEY,JOB_KEY]).limit(2),state.sb.from('job_posts').select('id,job_title').eq('company_id',state.companyId).order('job_title').limit(100)]);if(settingsResult.error||jobsResult.error){console.error('Materials load failed:',settingsResult.error||jobsResult.error);return showToast('Onboarding materials could not be loaded. Refresh the page and try again.',true);}const settings=Object.fromEntries((settingsResult.data||[]).map(row=>[row.key,row.value]));state.general=Array.isArray(settings[GENERAL_KEY])?settings[GENERAL_KEY]:[];state.byJob=settings[JOB_KEY]&&typeof settings[JOB_KEY]==='object'?settings[JOB_KEY]:{};state.jobs=jobsResult.data||[];render();}

  window.HRMaterials=Object.freeze({selectJob,openModal,closeModal,changeSource,changeGroup,saveFile,openDelete,closeDelete,deleteFile,openViewer,closeViewer,navigateViewer,dragStart,dragOver,dragOverGroup,dragEnd,drop,dropGroup});
  document.addEventListener('bk:hr-onboarding-ready',init,{once:true});
})();
