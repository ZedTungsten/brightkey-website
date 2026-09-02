(function () {
  'use strict';

  function create(app) {
    const bucket = app.state.sb.storage.from('brightkey-assets');
    let pendingSaveResolve = null;
    let pendingDelete = null;

    const publicUrl = path => bucket.getPublicUrl(path).data.publicUrl;
    const updateSaveButton = () => {
      const button = document.getElementById('header-save-canvas');
      button.disabled = !app.state.canvasReady || !app.state.projectDirty;
      document.getElementById('save-canvas-dimensions').disabled = !app.state.canvasReady;
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

    async function uploadAsset(entry, root, label, uploadedPaths) {
      if (entry.assetPath) return entry.assetPath;
      const blob = entry.file || await fetch(entry.url).then(response => response.blob());
      const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
      const path = `${root}/${label}.${extension}`;
      const { error } = await bucket.upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
      if (error) throw error;
      uploadedPaths.push(path);
      return path;
    }

    async function buildManifest(root, uploadedPaths) {
      if (app.state.images.length > 25) throw new Error('A canvas can contain up to 25 uploaded images.');
      const images = await Promise.all(app.state.images.map(async (entry, index) => ({
        name: entry.name,
        path: await uploadAsset(entry, root, `image-${index + 1}`, uploadedPaths),
        x: entry.x, y: entry.y, width: entry.width, height: entry.height,
        originalWidth: entry.originalWidth, originalHeight: entry.originalHeight,
        rotation: entry.rotation || 0, opacity: entry.opacity ?? 1,
        flipX: Boolean(entry.flipX), flipY: Boolean(entry.flipY)
      })));
      const overlays = {};
      for (const type of ['watermark', 'template']) {
        const entry = app.state.overlays[type];
        if (!entry) { overlays[type] = null; continue; }
        overlays[type] = {
          path: await uploadAsset(entry, root, type, uploadedPaths),
          x: entry.x, y: entry.y, width: entry.width, height: entry.height, opacity: entry.opacity ?? 1
        };
      }
      return {
        version: 1,
        background: app.state.background,
        baseImagePath: app.state.baseImagePath || null,
        images,
        overlays
      };
    }

    async function save() {
      const nameInput = document.getElementById('saved-canvas-name');
      const errorNode = document.getElementById('save-canvas-error');
      const saveButton = document.getElementById('save-canvas');
      const name = nameInput.value.trim();
      errorNode.hidden = Boolean(name);
      nameInput.style.borderColor = name ? '' : 'var(--danger)';
      if (!name || !app.state.canvasReady || !app.state.companyId) { if (!name) nameInput.focus(); return false; }
      saveButton.disabled = true;
      saveButton.textContent = 'Saving...';
      const revision = crypto.randomUUID();
      const root = `companies/${app.state.companyId}/posting/projects/${revision}`;
      const previewPath = `${root}/preview.png`;
      const uploadedPaths = [];
      try {
        const projectData = await buildManifest(root, uploadedPaths);
        const preview = await app.canvasBlob();
        const { error: uploadError } = await bucket.upload(previewPath, preview, { contentType: 'image/png', cacheControl: '31536000', upsert: false });
        if (uploadError) throw uploadError;
        uploadedPaths.push(previewPath);
        const values = { company_id: app.state.companyId, name, width: app.state.width, height: app.state.height, image_path: previewPath, project_data: projectData, updated_at: new Date().toISOString() };
        let query;
        if (app.state.currentProjectId) query = app.state.sb.from('posting_image_canvases').update(values).eq('id', app.state.currentProjectId).eq('company_id', app.state.companyId).select('id').single();
        else query = app.state.sb.from('posting_image_canvases').insert(values).select('id').single();
        const { data, error } = await query;
        if (error) throw error;
        app.state.currentProjectId = data.id;
        app.state.currentProjectName = name;
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
      app.state.savedCanvases = data || [];
      return app.state.savedCanvases;
    }

    const fetchCanvasPresets = () => fetchSaved(false);
    const fetchProjects = () => fetchSaved(true);

    function renderSaved() {
      const list = document.getElementById('saved-canvases-list');
      if (!app.state.savedCanvases.length) { list.innerHTML = '<div class="saved-canvases-state">No saved files yet.</div>'; return; }
      const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
      list.replaceChildren(...app.state.savedCanvases.map(saved => {
        const row = document.createElement('article'); row.className = 'saved-canvas-card';
        const preview = document.createElement('img'); preview.className = 'saved-canvas-preview'; preview.src = publicUrl(saved.image_path); preview.alt = '';
        const details = document.createElement('div'); details.className = 'saved-canvas-details';
        const name = document.createElement('strong'); name.textContent = saved.name; name.title = saved.name;
        const date = document.createElement('span'); date.textContent = formatter.format(new Date(saved.updated_at || saved.created_at));
        const dimensions = document.createElement('span'); dimensions.textContent = `${saved.width} × ${saved.height}`;
        const actions = document.createElement('div'); actions.className = 'saved-canvas-actions';
        const deleteButton = document.createElement('button'); deleteButton.type = 'button'; deleteButton.className = 'btn btn-danger'; deleteButton.dataset.deleteCanvasId = saved.id; deleteButton.textContent = 'Delete';
        const loadButton = document.createElement('button'); loadButton.type = 'button'; loadButton.className = 'btn btn-cyan'; loadButton.dataset.canvasId = saved.id; loadButton.textContent = 'Load';
        actions.append(deleteButton, loadButton); details.append(name, date, dimensions); row.append(preview, details, actions); return row;
      }));
    }

    function openDelete(saved) {
      pendingDelete = saved;
      document.getElementById('delete-document-name').textContent = saved.name;
      app.openModal(document.getElementById('delete-document-modal'));
    }

    function projectAssetPaths(saved) {
      const manifest = saved.project_data || {};
      const paths = [saved.image_path, manifest.baseImagePath];
      (manifest.images || []).forEach(entry => paths.push(entry.path));
      ['watermark', 'template'].forEach(type => paths.push(manifest.overlays?.[type]?.path));
      const prefix = `companies/${app.state.companyId}/posting/projects/`;
      return [...new Set(paths.filter(path => typeof path === 'string' && path.startsWith(prefix)))];
    }

    async function remove() {
      if (!pendingDelete) return;
      const saved = pendingDelete;
      const button = document.getElementById('confirm-delete-document');
      button.disabled = true; button.textContent = 'Deleting...';
      try {
        const { error } = await app.state.sb.from('posting_image_canvases').delete()
          .eq('id', saved.id).eq('company_id', app.state.companyId).select('id').single();
        if (error) throw error;
        const paths = projectAssetPaths(saved);
        if (paths.length) {
          const { error: storageError } = await bucket.remove(paths);
          if (storageError) console.warn('Saved document assets could not be fully removed.', storageError);
        }
        app.state.savedCanvases = app.state.savedCanvases.filter(item => item.id !== saved.id);
        if (app.state.currentProjectId === saved.id) {
          app.state.currentProjectId = null;
          app.state.currentProjectName = '';
          markDirty();
        }
        pendingDelete = null;
        app.closeModal(document.getElementById('delete-document-modal'));
        renderSaved();
        app.toast('Document deleted.');
      } catch (error) {
        console.error(error);
        app.toast('Document could not be deleted. Please try again.');
      } finally {
        button.disabled = false; button.textContent = 'Delete';
      }
    }

    async function openLoad() {
      const list = document.getElementById('saved-canvases-list');
      list.innerHTML = '<div class="saved-canvases-state"><span class="spinner-cyan"></span><span>Loading saved files...</span></div>';
      app.openModal(document.getElementById('load-canvas-modal'));
      try { await fetchProjects(); renderSaved(); }
      catch (error) { console.error(error); list.innerHTML = '<div class="saved-canvases-state">Saved files could not be loaded.</div>'; }
    }

    async function load(saved, button) {
      button.disabled = true; button.textContent = 'Loading...';
      try {
        const manifest = saved.project_data;
        app.state.width = saved.width; app.state.height = saved.height; app.state.canvasReady = true; app.state.zoom = 100;
        app.state.background = manifest?.background || '#FFFFFF'; app.state.images = []; app.state.activeIndex = -1;
        app.state.baseImagePath = manifest?.baseImagePath || (!manifest ? saved.image_path : null);
        app.state.baseImage = app.state.baseImagePath ? await loadImage(publicUrl(app.state.baseImagePath)) : null;
        if (!manifest && app.state.baseImage) { const color = app.solidImageColor(app.state.baseImage); app.state.background = color || '#FFFFFF'; if (color) { app.state.baseImage = null; app.state.baseImagePath = null; } }
        if (manifest?.images?.length) app.state.images = await Promise.all(manifest.images.map(async entry => ({ ...entry, assetPath: entry.path, url: publicUrl(entry.path), image: await loadImage(publicUrl(entry.path)) })));
        app.state.overlays = { watermark: null, template: null };
        for (const type of ['watermark', 'template']) { const entry = manifest?.overlays?.[type]; if (entry) app.state.overlays[type] = { ...entry, assetPath: entry.path, url: publicUrl(entry.path), image: await loadImage(publicUrl(entry.path)) }; }
        app.state.selected = null; app.state.drag = null; app.state.currentProjectId = saved.id; app.state.currentProjectName = saved.name; app.rememberCanvasCreated();
        document.getElementById('background-color').value = app.state.background; document.getElementById('background-hex').value = app.state.background;
        app.renderStrip(); app.showCanvas(); markClean(); app.closeModal(document.getElementById('load-canvas-modal')); app.closeModal(document.getElementById('size-modal')); app.toast(`Loaded ${saved.name}.`);
      } catch (error) { console.error(error); app.toast('Canvas could not be loaded. Please try again.'); }
      finally { button.disabled = false; button.textContent = 'Load'; }
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

    return { fetchCanvasPresets, fetchProjects, load, markClean, markDirty, openDelete, openLoad, openSave, remove, save, saveBeforeLeave, updateSaveButton };
  }

  window.BKImageEditorProjects = { create };
}());
