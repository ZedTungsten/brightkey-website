(function () {
  'use strict';

  function create(app) {
    const bucket = app.state.sb.storage.from('brightkey-assets');
    let pendingSaveResolve = null;
    let pendingDelete = [];
    let pendingOverwrite = null;
    let pendingLoad = null;
    let searchQuery = '';
    let editingProjectId = null;
    const selectedProjectIds = new Set();

    const publicUrl = path => bucket.getPublicUrl(path).data.publicUrl;
    const updateSaveButton = () => {
      const button = document.getElementById('header-save-canvas');
      button.disabled = !app.state.canvasReady || !app.state.projectDirty;
      document.getElementById('header-download-canvas').disabled = !app.state.canvasReady;
    };
    const markDirty = () => { app.state.projectDirty = true; updateSaveButton(); app.guard?.arm(); };
    const markClean = () => { app.state.projectDirty = false; updateSaveButton(); app.guard?.release(); };

    function loadImage(url) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      });
    }

    async function uploadAsset(entry, root, label, uploadedPaths, copyExisting, forceUpload) {
      if (entry.assetPath && !copyExisting) return entry.assetPath;
      if (entry.assetPath && !forceUpload) {
        const path = `${root}/${label}.${assetExtension(entry.assetPath, 'png')}`;
        const { error } = await bucket.copy(entry.assetPath, path);
        if (!error) { uploadedPaths.push(path); return path; }
        console.warn('Stored layer asset could not be copied; uploading its loaded source instead.', error);
      }
      const blob = entry.file || await fetch(entry.url).then(response => { if (!response.ok) throw new Error('The layer image source is no longer available.'); return response.blob(); });
      const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
      const path = `${root}/${label}.${extension}`;
      const { error } = await bucket.upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
      if (error) throw error;
      uploadedPaths.push(path);
      return path;
    }

    async function buildManifest(root, uploadedPaths, copyExisting, includeBaseImage = true, forceUpload = false) {
      if (app.state.images.length > 25) throw new Error('A canvas can contain up to 25 uploaded images.');
      const images = await Promise.all(app.state.images.map(async (entry, index) => ({
        name: entry.name,
        path: await uploadAsset(entry, root, `image-${index + 1}`, uploadedPaths, copyExisting, forceUpload),
        x: entry.x, y: entry.y, width: entry.width, height: entry.height,
        originalWidth: entry.originalWidth, originalHeight: entry.originalHeight,
        rotation: entry.rotation || 0, opacity: entry.opacity ?? 1,
        flipX: Boolean(entry.flipX), flipY: Boolean(entry.flipY),
        effects: entry.effects || null
      })));
      let baseImagePath = includeBaseImage ? app.state.baseImagePath || null : null;
      if (baseImagePath && copyExisting) {
        const copiedBasePath = `${root}/base.${assetExtension(baseImagePath, 'png')}`;
        const { error } = await bucket.copy(baseImagePath, copiedBasePath);
        if (error) throw error;
        uploadedPaths.push(copiedBasePath);
        baseImagePath = copiedBasePath;
      }
      return {
        version: 1,
        background: app.state.background,
        baseImagePath,
        images
      };
    }

    async function findNameConflict(name) {
      let query = app.state.sb.from('posting_image_canvases')
        .select('id,name,width,height,image_path,project_data')
        .eq('company_id', app.state.companyId)
        .eq('name', name)
        .not('project_data', 'is', null);
      if (app.state.currentProjectId) query = query.neq('id', app.state.currentProjectId);
      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw error;
      return data || null;
    }

    async function save(overwriteTarget = null, skipNameCheck = false) {
      const nameInput = document.getElementById('saved-canvas-name');
      const errorNode = document.getElementById('save-canvas-error');
      const saveButton = document.getElementById('save-canvas');
      const name = nameInput.value.trim();
      errorNode.hidden = Boolean(name);
      nameInput.style.borderColor = name ? '' : 'var(--danger)';
      if (!name || !app.state.canvasReady || !app.state.companyId) { if (!name) nameInput.focus(); return false; }
      saveButton.disabled = true;
      saveButton.textContent = 'Checking...';
      if (!overwriteTarget && !skipNameCheck) {
        try {
          const conflict = await findNameConflict(name);
          if (conflict) {
            pendingOverwrite = conflict;
            document.getElementById('overwrite-document-name').textContent = name;
            app.openModal(document.getElementById('overwrite-document-modal'));
            return false;
          }
        } catch (error) {
          console.error(error);
          app.toast('Saved file names could not be checked. Please try again.');
          return false;
        } finally {
          saveButton.disabled = false;
          saveButton.textContent = 'Save Document';
        }
      }
      saveButton.disabled = true;
      saveButton.textContent = 'Saving...';
      const revision = crypto.randomUUID();
      const root = `companies/${app.state.companyId}/posting/projects/${revision}`;
      const previewPath = `${root}/preview.png`;
      const uploadedPaths = [];
      const targetId = overwriteTarget?.id || app.state.currentProjectId;
      const copyExisting = Boolean(overwriteTarget && app.state.currentProjectId && overwriteTarget.id !== app.state.currentProjectId);
      try {
        const projectData = await buildManifest(root, uploadedPaths, copyExisting);
        const preview = await app.canvasBlob();
        const { error: uploadError } = await bucket.upload(previewPath, preview, { contentType: 'image/png', cacheControl: '31536000', upsert: false });
        if (uploadError) throw uploadError;
        uploadedPaths.push(previewPath);
        const values = { company_id: app.state.companyId, name, width: app.state.width, height: app.state.height, image_path: previewPath, project_data: projectData, updated_at: new Date().toISOString() };
        let query;
        if (targetId) query = app.state.sb.from('posting_image_canvases').update(values).eq('id', targetId).eq('company_id', app.state.companyId).select('id').single();
        else query = app.state.sb.from('posting_image_canvases').insert(values).select('id').single();
        const { data, error } = await query;
        if (error) throw error;
        app.state.currentProjectId = data.id;
        app.state.currentProjectName = name;
        if (overwriteTarget) {
          const retainedPaths = new Set([previewPath, projectData.baseImagePath, ...projectData.images.map(entry => entry.path)].filter(Boolean));
          const replacedPaths = projectAssetPaths(overwriteTarget).filter(path => !retainedPaths.has(path));
          if (replacedPaths.length) {
            const { error: cleanupError } = await bucket.remove(replacedPaths);
            if (cleanupError) console.warn('Overwritten document assets could not be fully removed.', cleanupError);
          }
          pendingOverwrite = null;
          app.closeModal(document.getElementById('overwrite-document-modal'));
        }
        markClean();
        app.closeModal(document.getElementById('save-canvas-modal'));
        app.toast('Document saved.');
        pendingSaveResolve?.(true); pendingSaveResolve = null;
        return true;
      } catch (error) {
        console.error(error);
        if (uploadedPaths.length) await bucket.remove(uploadedPaths);
        app.toast(error.message === 'A canvas can contain up to 25 uploaded images.' ? error.message : 'Document could not be saved. Please try again.');
        return false;
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save Document';
      }
    }

    function cancelOverwrite() {
      pendingOverwrite = null;
    }

    async function confirmOverwrite(button) {
      if (!pendingOverwrite) return;
      const target = pendingOverwrite;
      button.disabled = true; button.textContent = 'Overwriting...';
      try { await save(target); }
      finally { button.disabled = false; button.textContent = 'Overwrite'; }
    }

    function openSave() {
      document.getElementById('save-canvas-error').hidden = true;
      const input = document.getElementById('saved-canvas-name');
      input.style.borderColor = '';
      input.value = app.state.currentProjectName || '';
      app.openModal(document.getElementById('save-canvas-modal'));
      setTimeout(() => input.focus(), 0);
    }

    async function fetchSaved(projectsOnly) {
      let query = app.state.sb.from('posting_image_canvases')
        .select('id,name,width,height,image_path,project_data,created_at,updated_at')
        .eq('company_id', app.state.companyId);
      query = projectsOnly ? query.not('project_data', 'is', null) : query.is('project_data', null);
      const { data, error } = await query.order('updated_at', { ascending: false }).limit(100);
      if (error) throw error;
      app.state.savedCanvases = (data || []).filter(saved => projectsOnly ? saved.project_data?.kind !== 'layer-set' : true);
      return app.state.savedCanvases;
    }

    const fetchCanvasPresets = () => fetchSaved(false);
    const fetchProjects = () => fetchSaved(true);

    async function openLayerSets() {
      const list = document.getElementById('layer-set-list'); app.openModal(document.getElementById('load-layer-set-modal'));
      list.innerHTML = '<div class="size-saved-state"><span class="spinner-cyan"></span><span>Loading saved layers...</span></div>';
      const { data, error } = await app.state.sb.from('posting_image_canvases').select('id,name,width,height,project_data').eq('company_id', app.state.companyId).not('project_data','is',null).order('updated_at',{ascending:false}).limit(100);
      if (error) { list.innerHTML = '<div class="size-saved-state">Saved layers could not be loaded.</div>'; return; }
      const sets = (data || []).filter(item => item.project_data?.kind === 'layer-set');
      if (!sets.length) { list.innerHTML = '<div class="size-saved-state">No saved layers yet.</div>'; return; }
      list.replaceChildren(...sets.map(set => { const button=document.createElement('button'); button.type='button'; button.className='size-saved-option'; button.dataset.layerSetId=set.id; const name=document.createElement('strong'); name.textContent=set.name; const count=document.createElement('span'); count.textContent=`${set.project_data.images?.length || 0} layers`; button.append(name,count); button.addEventListener('click',()=>loadLayerSet(set,button)); return button; }));
    }

    function openSaveLayers() { document.getElementById('layer-set-name').value=''; document.getElementById('layer-set-name-error').hidden=true; app.openModal(document.getElementById('save-layer-set-modal')); setTimeout(()=>document.getElementById('layer-set-name').focus(),0); }
    async function saveLayerSet() {
      const input=document.getElementById('layer-set-name'), button=document.getElementById('confirm-save-layer-set'), name=input.value.trim(); document.getElementById('layer-set-name-error').hidden=Boolean(name);
      if (!name || !app.state.images.length) return; button.disabled=true; button.textContent='Saving...'; const root=`companies/${app.state.companyId}/posting/layer-sets/${crypto.randomUUID()}`, uploaded=[];
      try { const manifest=await buildManifest(root,uploaded,true,false,true); manifest.kind='layer-set'; const {error}=await app.state.sb.from('posting_image_canvases').insert({company_id:app.state.companyId,name,width:app.state.width,height:app.state.height,image_path:'',project_data:manifest}); if(error) throw error; app.closeModal(document.getElementById('save-layer-set-modal')); app.toast('Layers saved.'); }
      catch(error){ console.error(error); if(uploaded.length) await bucket.remove(uploaded); app.toast('Layers could not be saved.'); }
      finally { button.disabled=false; button.textContent='Save Layers'; }
    }
    async function loadLayerSet(set,button) {
      if (app.state.images.length+(set.project_data.images?.length||0)>25) { app.toast('A canvas can contain up to 25 uploaded images.'); return; } button.disabled=true;
      try { const sourceWidth=Number(set.width)||app.state.width,sourceHeight=Number(set.height)||app.state.height,scale=Math.min(app.state.width/sourceWidth,app.state.height/sourceHeight),offsetX=(app.state.width-sourceWidth*scale)/2,offsetY=(app.state.height-sourceHeight*scale)/2; const loaded=await Promise.all((set.project_data.images||[]).map(async entry=>({...entry,x:offsetX+entry.x*scale,y:offsetY+entry.y*scale,width:entry.width*scale,height:entry.height*scale,originalWidth:(entry.originalWidth||entry.width)*scale,originalHeight:(entry.originalHeight||entry.height)*scale,assetPath:entry.path,url:publicUrl(entry.path),image:await loadImage(publicUrl(entry.path))}))); const start=app.state.images.length; app.state.images.push(...loaded); app.state.selectedIndices=new Set(loaded.map((_,index)=>start+index)); app.state.activeIndex=app.state.images.length-1; app.state.selected='image'; app.renderStrip(); app.drawCanvas(); markDirty(); app.closeModal(document.getElementById('load-layer-set-modal')); app.toast(`Loaded ${loaded.length} layers.`); }
      catch(error){ console.error(error); app.toast('Saved layers could not be loaded.'); } finally { button.disabled=false; }
    }

    function selectedProjects() {
      return app.state.savedCanvases.filter(saved => selectedProjectIds.has(saved.id));
    }

    function visibleProjects() {
      return app.state.savedCanvases.filter(saved => String(saved.name || '').toLowerCase().includes(searchQuery));
    }

    function updateSelectionActions() {
      const count = selectedProjectIds.size;
      const countNode = document.getElementById('selected-files-count');
      countNode.textContent = `Selected file${count === 1 ? '' : 's'}: ${count}`;
      countNode.hidden = count === 0;
      const visible = visibleProjects();
      document.getElementById('select-all-saved-files').disabled = !visible.length || visible.every(saved => selectedProjectIds.has(saved.id));
      document.getElementById('deselect-all-saved-files').hidden = count === 0;
      document.getElementById('duplicate-selected-documents').disabled = count === 0;
      document.getElementById('delete-selected-documents').disabled = count === 0;
    }

    function renderSaved() {
      const list = document.getElementById('saved-canvases-list');
      if (!app.state.savedCanvases.length) { list.innerHTML = '<div class="saved-canvases-state">No saved files yet.</div>'; updateSelectionActions(); return; }
      const visible = visibleProjects();
      if (!visible.length) { list.innerHTML = '<div class="saved-canvases-state">No saved files match your search.</div>'; updateSelectionActions(); return; }
      const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
      list.replaceChildren(...visible.map(saved => {
        const row = document.createElement('article'); row.className = `saved-canvas-card${selectedProjectIds.has(saved.id) ? ' selected' : ''}`;
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'saved-canvas-select'; checkbox.checked = selectedProjectIds.has(saved.id); checkbox.dataset.selectCanvasId = saved.id; checkbox.setAttribute('aria-label', `Select ${saved.name}`);
        const preview = document.createElement('img'); preview.className = 'saved-canvas-preview'; preview.src = publicUrl(saved.image_path); preview.alt = '';
        const details = document.createElement('div'); details.className = 'saved-canvas-details';
        const name = editingProjectId === saved.id ? document.createElement('input') : document.createElement('strong');
        if (editingProjectId === saved.id) {
          name.type = 'text'; name.className = 'saved-canvas-name-input'; name.value = saved.name; name.maxLength = 120; name.dataset.renameCanvasInput = saved.id; name.setAttribute('aria-label', `Rename ${saved.name}`);
        } else { name.textContent = saved.name; name.title = saved.name; }
        const date = document.createElement('span'); date.textContent = formatter.format(new Date(saved.updated_at || saved.created_at));
        const dimensions = document.createElement('span'); dimensions.textContent = `${saved.width} × ${saved.height}`;
        const actions = document.createElement('div'); actions.className = 'saved-canvas-actions';
        if (editingProjectId === saved.id) {
          const cancelButton = document.createElement('button'); cancelButton.type = 'button'; cancelButton.className = 'saved-canvas-rename-action saved-canvas-rename-cancel'; cancelButton.dataset.cancelRenameId = saved.id; cancelButton.setAttribute('aria-label', 'Cancel rename'); cancelButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>';
          const applyButton = document.createElement('button'); applyButton.type = 'button'; applyButton.className = 'saved-canvas-rename-action saved-canvas-rename-apply'; applyButton.dataset.applyRenameId = saved.id; applyButton.setAttribute('aria-label', 'Apply rename'); applyButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>';
          actions.append(cancelButton, applyButton);
        } else {
          const editButton = document.createElement('button'); editButton.type = 'button'; editButton.className = 'saved-canvas-edit'; editButton.dataset.editCanvasId = saved.id; editButton.setAttribute('aria-label', `Rename ${saved.name}`); editButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg>';
          const loadButton = document.createElement('button'); loadButton.type = 'button'; loadButton.className = 'btn btn-cyan saved-canvas-load'; loadButton.dataset.canvasId = saved.id; loadButton.textContent = 'Load';
          actions.append(editButton, loadButton);
        }
        details.append(name, date, dimensions); row.append(checkbox, preview, details, actions); return row;
      }));
      updateSelectionActions();
    }

    function toggleSelection(id, checked) {
      if (checked) selectedProjectIds.add(id);
      else selectedProjectIds.delete(id);
      renderSaved();
    }

    function setSearchQuery(value) {
      searchQuery = String(value || '').trim().toLowerCase();
      renderSaved();
    }

    function selectAllVisible() {
      visibleProjects().forEach(saved => selectedProjectIds.add(saved.id));
      renderSaved();
    }

    function deselectAll() {
      selectedProjectIds.clear();
      renderSaved();
    }

    function startRename(id) {
      editingProjectId = id;
      renderSaved();
      setTimeout(() => {
        const input = document.querySelector(`[data-rename-canvas-input="${id}"]`);
        input?.focus(); input?.select();
      }, 0);
    }

    function cancelRename() {
      editingProjectId = null;
      renderSaved();
    }

    async function applyRename(id, value, button) {
      const saved = app.state.savedCanvases.find(item => item.id === id);
      const name = String(value || '').trim();
      if (!saved || !name) {
        document.querySelector(`[data-rename-canvas-input="${id}"]`)?.focus();
        return;
      }
      button.disabled = true;
      try {
        const { error } = await app.state.sb.from('posting_image_canvases').update({ name, updated_at: new Date().toISOString() })
          .eq('id', id).eq('company_id', app.state.companyId).select('id').single();
        if (error) throw error;
        saved.name = name;
        saved.updated_at = new Date().toISOString();
        if (app.state.currentProjectId === id) app.state.currentProjectName = name;
        editingProjectId = null;
        renderSaved();
        app.toast('File renamed.');
      } catch (error) {
        console.error(error);
        button.disabled = false;
        app.toast('File could not be renamed. Please try again.');
      }
    }

    function openDelete(savedItems = selectedProjects()) {
      pendingDelete = savedItems;
      if (!pendingDelete.length) return;
      document.getElementById('delete-document-name').textContent = pendingDelete.length === 1 ? pendingDelete[0].name : `${pendingDelete.length} selected documents`;
      app.openModal(document.getElementById('delete-document-modal'));
    }

    function projectAssetPaths(saved) {
      const manifest = saved.project_data || {};
      const paths = [saved.image_path, manifest.baseImagePath];
      (manifest.images || []).forEach(entry => paths.push(entry.path));
      // Historical projects may still own retired overlay assets; delete them with the project.
      ['watermark', 'template'].forEach(type => paths.push(manifest.overlays?.[type]?.path));
      const prefix = `companies/${app.state.companyId}/posting/projects/`;
      return [...new Set(paths.filter(path => typeof path === 'string' && path.startsWith(prefix)))];
    }

    async function remove() {
      if (!pendingDelete.length) return;
      const savedItems = [...pendingDelete];
      const ids = savedItems.map(saved => saved.id);
      const button = document.getElementById('confirm-delete-document');
      button.disabled = true; button.textContent = 'Deleting...';
      try {
        const { error } = await app.state.sb.from('posting_image_canvases').delete()
          .in('id', ids).eq('company_id', app.state.companyId).select('id');
        if (error) throw error;
        const paths = [...new Set(savedItems.flatMap(projectAssetPaths))];
        if (paths.length) {
          const { error: storageError } = await bucket.remove(paths);
          if (storageError) console.warn('Saved document assets could not be fully removed.', storageError);
        }
        app.state.savedCanvases = app.state.savedCanvases.filter(item => !ids.includes(item.id));
        if (ids.includes(app.state.currentProjectId)) {
          app.state.currentProjectId = null;
          app.state.currentProjectName = '';
          markDirty();
        }
        ids.forEach(id => selectedProjectIds.delete(id));
        pendingDelete = [];
        app.closeModal(document.getElementById('delete-document-modal'));
        renderSaved();
        app.toast(savedItems.length === 1 ? 'Document deleted.' : `${savedItems.length} documents deleted.`);
      } catch (error) {
        console.error(error);
        app.toast('Document could not be deleted. Please try again.');
      } finally {
        button.disabled = false; button.textContent = 'Delete';
      }
    }

    async function openLoad() {
      selectedProjectIds.clear();
      searchQuery = '';
      editingProjectId = null;
      document.getElementById('saved-files-search').value = '';
      updateSelectionActions();
      const list = document.getElementById('saved-canvases-list');
      list.innerHTML = '<div class="saved-canvases-state"><span class="spinner-cyan"></span><span>Loading saved files...</span></div>';
      app.openModal(document.getElementById('load-canvas-modal'));
      try { await fetchProjects(); renderSaved(); }
      catch (error) { console.error(error); list.innerHTML = '<div class="saved-canvases-state">Saved files could not be loaded.</div>'; }
    }

    function assetExtension(path, fallback = 'png') {
      const match = String(path || '').match(/\.([a-z0-9]+)$/i);
      return match?.[1] || fallback;
    }

    function duplicateName(name) {
      const value = String(name || 'Untitled').trim();
      const match = value.match(/^(.*) \(copy (\d+)\)$/i);
      if (!match) return `${value} (copy 1)`;
      return `${match[1]} (copy ${Number(match[2]) + 1})`;
    }

    async function duplicateProject(saved) {
      const root = `companies/${app.state.companyId}/posting/projects/${crypto.randomUUID()}`;
      const copiedPaths = [];
      const copyAsset = async (source, label, fallback) => {
        if (!source) return null;
        const destination = `${root}/${label}.${assetExtension(source, fallback)}`;
        const { error } = await bucket.copy(source, destination);
        if (error) throw error;
        copiedPaths.push(destination);
        return destination;
      };
      try {
        const previewPath = await copyAsset(saved.image_path, 'preview', 'png');
        const manifest = saved.project_data || {};
        const images = await Promise.all((manifest.images || []).map(async (entry, index) => ({
          ...entry,
          path: await copyAsset(entry.path, `image-${index + 1}`, 'png')
        })));
        const projectData = {
          ...manifest,
          baseImagePath: await copyAsset(manifest.baseImagePath, 'base', 'png'),
          images
        };
        delete projectData.overlays;
        const { error } = await app.state.sb.from('posting_image_canvases').insert({
          company_id: app.state.companyId,
          name: duplicateName(saved.name),
          width: saved.width,
          height: saved.height,
          image_path: previewPath,
          project_data: projectData
        });
        if (error) throw error;
      } catch (error) {
        if (copiedPaths.length) await bucket.remove(copiedPaths);
        throw error;
      }
    }

    async function duplicateSelected(button) {
      const savedItems = selectedProjects();
      if (!savedItems.length) return;
      button.disabled = true; button.textContent = 'Duplicating...';
      try {
        for (const saved of savedItems) await duplicateProject(saved);
        selectedProjectIds.clear();
        await fetchProjects();
        renderSaved();
        app.toast(savedItems.length === 1 ? 'Document duplicated.' : `${savedItems.length} documents duplicated.`);
      } catch (error) {
        console.error(error);
        app.toast('Selected documents could not be duplicated. Please try again.');
      } finally {
        button.disabled = false; button.textContent = 'Duplicate';
      }
    }

    async function load(saved, button) {
      button.disabled = true; button.textContent = 'Loading...';
      try {
        const manifest = saved.project_data;
        app.state.width = saved.width; app.state.height = saved.height; app.state.canvasReady = true; app.state.zoom = 100;
        app.state.background = manifest?.background || '#FFFFFF'; app.state.images = []; app.state.activeIndex = -1; app.state.selectedIndices.clear();
        app.state.baseImagePath = manifest?.baseImagePath || (!manifest ? saved.image_path : null);
        app.state.baseImage = app.state.baseImagePath ? await loadImage(publicUrl(app.state.baseImagePath)) : null;
        if (!manifest && app.state.baseImage) { const color = app.solidImageColor(app.state.baseImage); app.state.background = color || '#FFFFFF'; if (color) { app.state.baseImage = null; app.state.baseImagePath = null; } }
        if (manifest?.images?.length) app.state.images = await Promise.all(manifest.images.map(async entry => ({ ...entry, assetPath: entry.path, url: publicUrl(entry.path), image: await loadImage(publicUrl(entry.path)) })));
        app.state.selected = null; app.state.drag = null; app.state.currentProjectId = saved.id; app.state.currentProjectName = saved.name; app.rememberCanvasCreated();
        document.getElementById('background-color').value = app.state.background; document.getElementById('background-hex').value = app.state.background;
        app.renderStrip(); app.showCanvas(); markClean(); app.closeModal(document.getElementById('load-canvas-modal')); app.closeModal(document.getElementById('size-modal')); app.toast(`Loaded ${saved.name}.`);
      } catch (error) { console.error(error); app.toast('Canvas could not be loaded. Please try again.'); }
      finally { button.disabled = false; button.textContent = 'Load'; }
    }

    function requestLoad(saved, button) {
      if (!app.state.projectDirty) {
        load(saved, button);
        return;
      }
      pendingLoad = { saved, button };
      document.getElementById('load-unsaved-document-name').textContent = app.state.currentProjectName || 'the current document';
      app.openModal(document.getElementById('load-unsaved-document-modal'));
    }

    function discardChangesAndLoad() {
      if (!pendingLoad) return;
      const next = pendingLoad;
      pendingLoad = null;
      app.closeModal(document.getElementById('load-unsaved-document-modal'));
      load(next.saved, next.button);
    }

    async function saveChangesAndLoad(button) {
      if (!pendingLoad) return;
      button.disabled = true; button.textContent = 'Saving...';
      try {
        let saved = false;
        if (app.state.currentProjectId && app.state.currentProjectName) {
          document.getElementById('saved-canvas-name').value = app.state.currentProjectName;
          saved = await save(null, true);
        } else {
          app.closeModal(document.getElementById('load-unsaved-document-modal'));
          saved = await saveBeforeLeave();
          if (!saved && pendingLoad) app.openModal(document.getElementById('load-unsaved-document-modal'));
        }
        if (!saved || !pendingLoad) return;
        const next = pendingLoad;
        pendingLoad = null;
        app.closeModal(document.getElementById('load-unsaved-document-modal'));
        await load(next.saved, next.button);
      } finally {
        button.disabled = false; button.textContent = 'Save Changes';
      }
    }

    function saveBeforeLeave() {
      if (!app.state.projectDirty) return Promise.resolve(true);
      openSave();
      return new Promise(resolve => { pendingSaveResolve = resolve; });
    }

    document.getElementById('save-canvas-modal').addEventListener('click', event => {
      if (!pendingSaveResolve || (!event.target.closest('[data-close-modal]') && event.target !== event.currentTarget)) return;
      pendingSaveResolve(false); pendingSaveResolve = null;
    });

    return { applyRename, cancelOverwrite, cancelRename, confirmOverwrite, deselectAll, discardChangesAndLoad, duplicateSelected, fetchCanvasPresets, fetchProjects, markClean, markDirty, openDelete, openLayerSets, openLoad, openSave, openSaveLayers, remove, requestLoad, save, saveBeforeLeave, saveChangesAndLoad, saveLayerSet, selectAllVisible, setSearchQuery, startRename, toggleSelection, updateSaveButton };
  }

  window.BKImageEditorProjects = { create };
}());
