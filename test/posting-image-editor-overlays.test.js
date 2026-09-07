import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/posting/image-editor/index.html', import.meta.url), 'utf8');
const editor = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor.js', import.meta.url), 'utf8');
const selection = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor-selection.js', import.meta.url), 'utf8');
const projects = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor-projects.js', import.meta.url), 'utf8');
const effects = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor-effects.js', import.meta.url), 'utf8');
const properties = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor-properties.js', import.meta.url), 'utf8');
const mediaBrowser = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor-media-browser.js', import.meta.url), 'utf8');
const resourcesBrowser = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor-resources.js', import.meta.url), 'utf8');
const stagePan = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor-stage-pan.js', import.meta.url), 'utf8');
const unsavedGuard = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor-unsaved-guard.js', import.meta.url), 'utf8');
const mediaBrowserMigration = fs.readFileSync(new URL('../supabase/migrations/20260907093000_posting_image_browser_bookings.sql', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor.css', import.meta.url), 'utf8');

test('posting image editor no longer exposes or applies watermark and template overlays', () => {
  assert.doesNotMatch(page, /open-watermark-modal|open-template-modal|overlay-modal|overlay-file|apply-overlay/);
  assert.doesNotMatch(editor, /state\.overlays|draftOverlay|openOverlay|loadOverlay|drawOverlayPreview|previewPointer/);
  assert.doesNotMatch(projects, /const overlays =|app\.state\.overlays|overlays\s*$/m);
});

test('Posting is a shared Marketing and Sales module surface', () => {
  const sidebar = fs.readFileSync(new URL('../js/sidebar.js', import.meta.url), 'utf8');
  assert.match(editor, /checkRoleGate\(\['Marketing', 'Sales'\]/);
  assert.equal((sidebar.match(/href="\/dashboard\/posting\/image-editor"/g) || []).length, 2);
  assert.match(sidebar, /data-role="marketing"[^>]*><span>Posting<\/span>[\s\S]*data-role="sales"[^>]*><span>Posting<\/span>/);
});

test('deleting historical projects still cleans up retired overlay assets', () => {
  assert.match(projects, /Historical projects may still own retired overlay assets/);
  assert.match(projects, /manifest\.overlays\?\.\[type\]\?\.path/);
});

test('image editor toolbar and background value use the compact requested layout', () => {
  assert.doesNotMatch(page, /<span class="tool-kicker">Canvas<\/span>/);
  assert.match(page, /<div class="tool-heading"><h2>Canvas size<\/h2><span id="canvas-size-label">/);
  assert.match(styles, /\.editor-toolbar #fill-height \{ margin-left: auto; \}/);
  assert.match(styles, /\.color-control input\[type="text"\] \{[^}]*font-size: 0\.72rem;/);
  assert.match(styles, /\.canvas-zoom \{[^}]*background: #FFFFFF;/);
  assert.match(styles, /\.canvas-zoom input \{[^}]*#E4E4E7/);
  assert.match(editor, /zoomSlider\.style\.setProperty\('--zoom-progress'/);
});

test('canvas sidebar keeps creation as its only action and saves dimensions beside the fields', () => {
  assert.doesNotMatch(page, /load-canvas-dimensions|>Load Canvas<\/button>/);
  assert.doesNotMatch(page, /id="canvas-save-actions"/);
  assert.match(page, /id="canvas-height"[\s\S]{0,250}id="save-canvas-dimensions"[\s\S]*>Save Canvas<\/button>/);
  assert.match(styles, /\.size-grid \{[^}]*grid-template-columns: 1fr auto 1fr auto/);
  assert.doesNotMatch(projects, /save-canvas-dimensions'\)\.disabled/);
  assert.match(editor, /company_id: state\.companyId,[\s\S]*name,[\s\S]*width,[\s\S]*height,[\s\S]*project_data: null/);
  assert.match(editor, /document\.getElementById\('open-size-modal'\)\.addEventListener\('click', openSizeModal\)/);
  assert.match(page, /id="open-size-modal"[^>]*class="btn btn-cyan create-canvas-button">Create New Canvas<\/button>/);
  assert.doesNotMatch(page, /id="open-size-modal"[\s\S]{0,200}<svg/);
  assert.match(page, /id="open-size-modal"[\s\S]{0,300}for="background-hex">Canvas Color/);
  assert.doesNotMatch(page, />Background color<\/label>/);
});

test('image editor accepts HEIC uploads and converts them to JPEG before loading', () => {
  assert.match(page, /accept="[^"]*image\/heic[^"]*\.heic[^"]*"/);
  assert.match(page, /heic2any@0\.0\.4\/dist\/heic2any\.min\.js/);
  assert.match(editor, /function isHeicFile\(file\)/);
  assert.match(editor, /window\.heic2any\(\{ blob: file, toType: 'image\/jpeg', quality: 0\.9 \}\)/);
  assert.match(editor, /new File\(\[jpeg\], `\$\{baseName\}\.jpg`/);
  assert.match(editor, /const prepared = await Promise\.all\(valid\.map\(prepareImageFile\)\)/);
});

test('canvas clicks select the topmost visible image instead of the previously active image', () => {
  const hitTest = editor.slice(editor.indexOf('function canvasTargetAt(point)'), editor.indexOf('function updateCanvasCursor(point)'));
  assert.doesNotMatch(hitTest, /contains\(active, localPoint\)/);
  assert.doesNotMatch(hitTest, /if \(index === state\.activeIndex\) continue/);
  assert.match(hitTest, /for \(let index = state\.images\.length - 1; index >= 0; index -= 1\)/);
});

test('top-left selection handle duplicates selected images twenty pixels away and directly above each source layer', () => {
  assert.match(editor, /function isDuplicateHandle\(target, point, handleSize\)/);
  assert.match(editor, /action === 'duplicate' \? 'copy'/);
  assert.match(editor, /x: target\.x \+ 20, y: target\.y \+ 20/);
  assert.match(selection, /x:source\.x\+20,y:source\.y\+20/);
  assert.match(selection, /app\.state\.images\.splice\(at,0,copy\)/);
  assert.match(editor, /if \(action === 'duplicate'\) \{\s*duplicateImage\(target\)/);
});

test('header download exports a flattened PNG at the exact canvas dimensions', () => {
  assert.match(page, /id="header-load-canvas"[\s\S]*>Load File<\/button>/);
  assert.match(page, /header-save-canvas[\s\S]*header-download-canvas[\s\S]*>Download<\/button>/);
  assert.match(projects, /header-download-canvas'\)\.disabled = !app\.state\.canvasReady/);
  assert.match(editor, /async function downloadCanvas\(\)/);
  assert.match(editor, /const blob = await canvasBlob\(\)/);
  assert.match(editor, /link\.download = `\$\{baseName\}\.png`/);
  assert.match(editor, /Downloaded \$\{state\.width\} × \$\{state\.height\} PNG/);
});

test('load modal uses checkbox selection with bulk duplicate and delete actions', () => {
  assert.doesNotMatch(page, /saved-canvases-list[\s\S]{0,300}<button class="btn btn-outline" type="button" data-close-modal>Close/);
  assert.match(page, /saved-file-bulk-actions"[\s\S]*duplicate-selected-documents[\s\S]*disabled>Duplicate[\s\S]*delete-selected-documents[\s\S]*disabled>Delete/);
  assert.doesNotMatch(page, /load-selected-document/);
  assert.match(projects, /checkbox\.dataset\.selectCanvasId = saved\.id/);
  assert.match(projects, /loadButton\.dataset\.canvasId = saved\.id/);
  assert.match(projects, /bucket\.copy\(source, destination\)/);
  assert.match(projects, /\.in\('id', ids\)\.eq\('company_id', app\.state\.companyId\)/);
});

test('saved document duplicates use incrementing copy-number suffixes', () => {
  assert.match(projects, /function duplicateName\(name\)/);
  assert.match(projects, /return `\$\{value\} \(copy 1\)`/);
  assert.match(projects, /Number\(match\[2\]\) \+ 1/);
  assert.match(projects, /name: duplicateName\(saved\.name\)/);
});

test('load modal shows a selected-file count and searchable saved-file list', () => {
  assert.doesNotMatch(page, /Select a saved file to continue editing/);
  assert.match(page, /id="selected-files-count" hidden>Selected files: 0/);
  assert.match(page, /id="saved-files-search"[\s\S]*placeholder="Search saved files"/);
  assert.match(projects, /Selected file\$\{count === 1 \? '' : 's'\}: \$\{count\}/);
  assert.match(projects, /String\(saved\.name \|\| ''\)\.toLowerCase\(\)\.includes\(searchQuery\)/);
  assert.match(editor, /saved-files-search'\)\.addEventListener\('input'/);
});

test('saved-file selection controls hide the zero count and select visible search results', () => {
  assert.match(page, /saved-canvases-search[\s\S]*saved-selection-summary/);
  assert.match(page, /id="selected-files-count" hidden/);
  assert.match(page, /id="select-all-saved-files"[\s\S]*>Select All<\/button>/);
  assert.match(page, /id="deselect-all-saved-files"[\s\S]*hidden>Deselect All<\/button>/);
  assert.doesNotMatch(page, /saved-canvases-search[^>]*>[\s\S]{0,100}<svg/);
  assert.match(projects, /countNode\.hidden = count === 0/);
  assert.match(projects, /visibleProjects\(\)\.forEach\(saved => selectedProjectIds\.add\(saved\.id\)\)/);
  assert.match(editor, /select-all-saved-files'\)\.addEventListener\('click', projects\.selectAllVisible\)/);
});

test('saved-file rows reveal checkboxes on interaction and keep Load in each row', () => {
  assert.match(styles, /\.saved-canvas-select \{[^}]*opacity: 0;[^}]*pointer-events: none/);
  assert.match(styles, /\.saved-canvas-card:hover \.saved-canvas-select,\.saved-canvas-card\.selected \.saved-canvas-select,\.saved-canvas-select:focus/);
  assert.match(projects, /duplicate-selected-documents'\)\.disabled = count === 0/);
  assert.match(projects, /delete-selected-documents'\)\.disabled = count === 0/);
  assert.match(editor, /const row = event\.target\.closest\('\.saved-canvas-card'\)/);
  assert.match(editor, /projects\.toggleSelection\(checkbox\.dataset\.selectCanvasId, !checkbox\.checked\)/);
});

test('saved-file rows support hover-only inline rename controls', () => {
  assert.match(styles, /\.saved-canvas-edit \{[^}]*opacity: 0/);
  assert.match(styles, /\.saved-canvas-card:hover \.saved-canvas-edit/);
  assert.match(projects, /editButton\.dataset\.editCanvasId = saved\.id/);
  assert.match(projects, /name\.value = saved\.name/);
  assert.match(projects, /cancelButton\.dataset\.cancelRenameId = saved\.id/);
  assert.match(projects, /applyButton\.dataset\.applyRenameId = saved\.id/);
  assert.match(projects, /\.update\(\{ name, updated_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(editor, /projects\.applyRename\(applyRename\.dataset\.applyRenameId/);
});

test('saving an existing company filename requires custom overwrite confirmation', () => {
  assert.match(page, /id="overwrite-document-modal"[\s\S]*Overwrite file\?[\s\S]*data-cancel-overwrite>Cancel[\s\S]*btn btn-success[\s\S]*>Overwrite<\/button>/);
  assert.match(projects, /function findNameConflict\(name\)/);
  assert.match(projects, /\.eq\('company_id', app\.state\.companyId\)[\s\S]*\.eq\('name', name\)/);
  assert.match(projects, /if \(app\.state\.currentProjectId\) query = query\.neq\('id', app\.state\.currentProjectId\)/);
  assert.match(projects, /document\.getElementById\('overwrite-document-name'\)\.textContent = name/);
  assert.match(projects, /async function confirmOverwrite\(button\)/);
  assert.match(projects, /const replacedPaths = projectAssetPaths\(overwriteTarget\)/);
  assert.match(editor, /confirm-overwrite-document'\)\.addEventListener\('click'/);
});

test('loading over changes requires discard or direct save of the current document', () => {
  assert.match(page, /id="load-unsaved-document-modal" data-static-modal[\s\S]*Discard Changes[\s\S]*btn btn-success[\s\S]*Save Changes/);
  assert.match(projects, /function requestLoad\(saved, button\)/);
  assert.match(projects, /if \(!app\.state\.projectDirty\) \{[\s\S]*load\(saved, button\)/);
  assert.match(projects, /saved = await save\(null, true\)/);
  assert.match(projects, /closeModal\(document\.getElementById\('load-unsaved-document-modal'\)\)[\s\S]*saved = await saveBeforeLeave\(\)/);
  assert.match(projects, /if \(!saved && pendingLoad\) app\.openModal\(document\.getElementById\('load-unsaved-document-modal'\)\)/);
  assert.match(projects, /async function save\(overwriteTarget = null, skipNameCheck = false\)/);
  assert.match(editor, /projects\.requestLoad\(saved, loadButton\)/);
  assert.match(editor, /discard-current-document-changes'\)\.addEventListener\('click', projects\.discardChangesAndLoad\)/);
});

test('leaving with unsaved canvas changes offers cancel, discard, and save actions', () => {
  assert.doesNotMatch(page, /Your canvas has changes that have not been saved/);
  assert.match(page, /id="unsaved-changes-cancel"[\s\S]*>Cancel<[\s\S]*id="unsaved-changes-discard"[\s\S]*>Don't Save<[\s\S]*id="unsaved-changes-save"[\s\S]*>Save Changes</);
  assert.match(unsavedGuard, /unsaved-changes-cancel'\)\.addEventListener\('click', closeDialog\)/);
  assert.match(unsavedGuard, /unsaved-changes-discard'\)\.addEventListener\('click', proceedWithoutSaving\)/);
  assert.match(unsavedGuard, /const proceedWithoutSaving = \(\) => \{[\s\S]*allowPageUnload = true;[\s\S]*leaveAction\?\.\(\)/);
  assert.match(unsavedGuard, /const saved = await app\.saveBeforeLeave\(\)[\s\S]*if \(!saved\)[\s\S]*leaveAction\?\.\(\)/);
});

test('selected images support persisted drop-shadow and glow effects', () => {
  assert.match(page, /id="image-effects"[\s\S]*Drop Shadow[\s\S]*id="shadow-color"[\s\S]*id="shadow-opacity"[\s\S]*id="shadow-distance"[\s\S]*id="shadow-blur"/);
  assert.match(page, /id="image-effects"[\s\S]*Glow[\s\S]*id="glow-color"[\s\S]*id="glow-opacity"[\s\S]*id="glow-blur"/);
  assert.match(effects, /dropShadow: \{ enabled: false, color: '#000000', opacity: 60, distance: 20, blur: 20 \}/);
  assert.match(effects, /glow: \{ enabled: false, color: '#FFFFFF', opacity: 70, distance: 0, blur: 30 \}/);
  assert.match(effects, /!config\?\.enabled/);
  assert.match(effects, /surfaceContext\.shadowColor = rgba/);
  assert.match(effects, /globalCompositeOperation = 'destination-out'/);
  assert.match(editor, /effects: effects\.clone\(target\.effects\)/);
  assert.match(projects, /effects: entry\.effects \|\| null/);
});

test('image effect selector shows only the chosen effect settings', () => {
  assert.match(page, /id="image-effect-trigger"[\s\S]*id="image-effect-menu"[\s\S]*id="drop-shadow-enabled"[\s\S]*data-effect-view="dropShadow"[\s\S]*id="glow-enabled"[\s\S]*data-effect-view="glow"/);
  assert.match(page, /data-effect="dropShadow"/);
  assert.match(page, /data-effect="glow" hidden/);
  assert.match(effects, /group\.hidden = group\.dataset\.effect !== selectedEffect/);
  assert.match(effects, /selectedEffect = button\.dataset\.effectView/);
  assert.match(styles, /\.effect-group\[hidden\] \{ display: none; \}/);
  assert.match(page, /id="drop-shadow-enabled" type="checkbox"/);
  assert.match(page, /id="glow-enabled" type="checkbox"/);
  assert.doesNotMatch(page, /id="glow-distance/);
  assert.match(effects, /change\('dropShadow', 'enabled', event\.target\.checked\)/);
  assert.match(effects, /change\('glow', 'enabled', event\.target\.checked\)/);
});

test('image property and effect values accept typed numeric edits', () => {
  assert.match(page, /id="image-width-value" type="number"/);
  assert.match(page, /id="image-height-value" type="number"/);
  assert.match(page, /id="image-rotation-value" type="number"/);
  assert.match(page, /id="image-opacity-value" type="number"/);
  assert.match(page, /id="shadow-opacity-value" type="number"/);
  assert.match(page, /id="glow-blur-value" type="number"/);
  assert.match(properties, /commitDimensions/);
  assert.match(properties, /commitValue\('image-opacity-value'/);
  assert.match(effects, /valueInput\.addEventListener\('change'/);
  assert.match(styles, /\.editable-property-value input:focus/);
  assert.match(styles, /caret-color: currentColor/);
  assert.match(styles, /\.effect-range > input\[type="range"\]/);
  assert.doesNotMatch(styles, /\.effect-range input \{/);
});

test('image opacity slider uses cyan progress and a light gray remaining track', () => {
  assert.match(styles, /--image-opacity-progress,100%\),#E4E4E7/);
  assert.match(properties, /--image-opacity-progress', `\$\{opacity\}%`/);
  assert.match(editor, /--image-opacity-progress', `\$\{event\.target\.value\}%`/);
});

test('blank canvas space uses grab-to-pan without replacing image interactions', () => {
  assert.match(editor, /interactionCanvas\.style\.cursor = .*'grab'/);
  assert.match(editor, /state\.pan = \{/);
  assert.match(editor, /startScrollLeft: stage\.scrollLeft/);
  assert.match(editor, /stage\.scrollLeft = state\.pan\.startScrollLeft/);
  assert.match(editor, /stage\.scrollTop = state\.pan\.startScrollTop/);
  assert.match(editor, /action === 'move' \? 'move' : 'grab'/);
});

test('workspace outside the canvas also uses open-hand drag panning', () => {
  assert.match(page, /image-editor-stage-pan\.js/);
  assert.match(styles, /\.canvas-stage[\s\S]*cursor: grab/);
  assert.match(styles, /\.canvas-stage\.is-panning \{ cursor: grabbing/);
  assert.match(stagePan, /event\.target !== stage/);
  assert.match(stagePan, /stage\.scrollLeft = pan\.left/);
  assert.match(stagePan, /stage\.scrollTop = pan\.top/);
  assert.match(stagePan, /setPointerCapture/);
});

test('installer image browser lists only orders containing safe image uploads', () => {
  assert.match(page, /id="image-source-trigger"[^>]*aria-haspopup="menu"[^>]*>Upload Image/);
  assert.match(page, /id="upload-computer-image"[^>]*>Upload image from computer<\/button>/);
  assert.match(page, /id="browse-installer-images"[^>]*>Browse image from operations<\/button>/);
  assert.match(page, /id="browse-images-search"[\s\S]*Search order number or customer name/);
  assert.match(page, /id="browse-image-orders"[\s\S]*id="browse-order-images"/);
  assert.match(mediaBrowser, /rpc\('get_posting_image_browser_bookings'/);
  assert.match(mediaBrowser, /p_company_id:\s*app\.state\.companyId/);
  assert.match(mediaBrowser, /filter\(order => order\.images\.length > 0\)/);
  assert.match(mediaBrowser, /required_media[\s\S]*other_media/);
  assert.match(mediaBrowser, /IMAGE_PATTERN\.test\(url\)/);
  assert.match(mediaBrowser, /await app\.addFiles\(files\)/);
  assert.match(styles, /\.browse-images-layout/);
});

test('installer image browser uses month navigation and ten-order server pagination', () => {
  assert.match(page, /class="month-picker browse-month-picker"/);
  assert.match(page, /class="browse-images-toolbar"[\s\S]*id="browse-images-search"[\s\S]*id="browse-month-label"[\s\S]*class="browse-images-layout"/);
  assert.match(page, /id="browse-month-previous"[\s\S]*id="browse-month-label"[\s\S]*id="browse-month-next"/);
  assert.match(page, /id="browse-orders-load-more"[\s\S]*>Load More<\/button>/);
  assert.match(mediaBrowser, /const PAGE_SIZE = 10/);
  assert.match(mediaBrowser, /p_limit:PAGE_SIZE \+ 1/);
  assert.match(mediaBrowser, /p_search:document\.getElementById\('browse-images-search'\)\.value\.trim\(\)/);
  assert.match(mediaBrowser, /state\.orders\.push\(\.\.\.visiblePage\)/);
  assert.match(mediaBrowserMigration, /booking\.company_id = p_company_id/);
  assert.match(mediaBrowserMigration, /booking\.scheduled_date >= p_start_date[\s\S]*booking\.scheduled_date < p_end_date/);
  assert.match(mediaBrowserMigration, /booking\.order_no ILIKE[\s\S]*booking\.customer_name ILIKE/);
  assert.match(mediaBrowserMigration, /AND EXISTS \([\s\S]*required_media[\s\S]*other_media/);
  assert.match(mediaBrowserMigration, /GRANT EXECUTE[\s\S]*TO authenticated/);
});

test('customer media handoff requires canvas selection before importing the image', () => {
  assert.match(mediaBrowser, /const IMAGE_PATTERN = \/\^\(https\?:\\\/\\\/\|data:image/);
  assert.match(editor, /importHandoff\.openPendingCanvasSetup\(openSizeModal\)/);
  assert.match(editor, /async function runSizeAction\(\)[\s\S]*resizeCanvas\(\); await importHandoff\.importAfterCanvasReady\(\)/);
  assert.match(mediaBrowser, /async function importAfterCanvasReady\(\)[\s\S]*await fetch\(pending\.url\)[\s\S]*await app\.addFiles/);
  assert.match(mediaBrowser, /sessionStorage\.removeItem\(HANDOFF_KEY\)/);
});

test('Resources picker imports multiple JPG and PNG files without edit actions', () => {
  assert.match(page, /id="open-resources"[^>]*>Open resources folders<\/button>/);
  assert.match(page, /id="resources-picker-modal"[\s\S]*id="resources-search"[\s\S]*id="resources-folder-tree"[\s\S]*id="resources-picker-items"/);
  assert.match(page, /Cancel<\/button><button id="use-resource-images"[^>]*disabled>Use Image/);
  assert.doesNotMatch(resourcesBrowser, /card-dropdown|ellipsis|resources-edit/);
  assert.match(resourcesBrowser, /\.select\('id,name,parent_id,folder_color'\)[\s\S]*\.eq\('company_id',app\.state\.companyId\)[\s\S]*\.limit\(500\)/);
  assert.match(resourcesBrowser, /\.select\('id,name,file_type,file_url,thumbnail_url,parent_id'\)[\s\S]*\.in\('file_type',IMAGE_TYPES\)[\s\S]*\.limit\(100\)/);
  assert.match(resourcesBrowser, /selected:new Map\(\)/);
  assert.match(resourcesBrowser, /await app\.addFiles\(await Promise\.all\(items\.slice\(0,available\)\.map\(resourceFile\)\)\)/);
  assert.match(resourcesBrowser, /\['image\/png','image\/jpeg'\]\.includes\(blob\.type\)/);
  assert.match(styles, /\.resources-image-check \{[^}]*opacity:0/);
  assert.match(styles, /\.resources-image-tile:hover \.resources-image-check/);
});

test('Resources folder tree shows root folders and progressively reveals deeper children', () => {
  assert.match(resourcesBrowser, /expandedFolders:new Set\(\)/);
  assert.match(resourcesBrowser, /state\.folders=data\|\|\[\];state\.expandedFolders\.add\(null\);renderTree\(\)/);
  assert.match(resourcesBrowser, /function append\(parent,depth\)\{if\(!state\.expandedFolders\.has\(parent\)\)return;/);
  assert.match(resourcesBrowser, /state\.expandedFolders\.clear\(\)/);
  assert.match(styles, /\.resources-tree-item:not\(\.resources-tree-root\)::before \{[^}]*border-bottom:1px solid #D4D4D8;[^}]*border-left:1px solid #D4D4D8;/);
});

test('Resources picker applies saved folder colors in both columns', () => {
  assert.match(resourcesBrowser, /const FOLDER_COLORS=\{cyan:\{background:'#ECFEFF',border:'#67E8F9'\}/);
  assert.match(resourcesBrowser, /\.select\('id,name,parent_id,folder_color'\)/);
  assert.match(resourcesBrowser, /function folderIcon\(folder\)[\s\S]*FOLDER_COLORS\[folder\.folder_color\][\s\S]*path\.setAttribute\('fill',color\?\.background\|\|'none'\)/);
  assert.match(resourcesBrowser, /function folderButton\(folder,depth\)[\s\S]*button\.append\(folderIcon\(folder\)\)/);
  assert.match(resourcesBrowser, /function folderTile\(folder\)[\s\S]*icon\.append\(folderIcon\(folder\)\)/);
});

test('Resources picker folder cards match the Resources page grid styling', () => {
  assert.match(resourcesBrowser, /icon\.className='resources-folder-icon'/);
  assert.match(resourcesBrowser, /name\.className='resources-folder-name'/);
  assert.match(styles, /\.resources-folder-tile \{[^}]*min-height:140px;[^}]*padding:1rem \.5rem;[^}]*border-radius:12px;/);
  assert.match(styles, /\.resources-folder-icon \{[^}]*width:48px;[^}]*height:48px;[^}]*margin-bottom:\.5rem;/);
  assert.match(styles, /\.resources-folder-icon svg \{ width:32px; height:32px; \}/);
  assert.match(styles, /\.resources-folder-name \{[^}]*font-size:\.78rem;[^}]*font-weight:500;/);
});

test('layers can be saved and loaded as an ordered reusable set above current layers', () => {
  assert.match(page, /id="load-layer-set"[\s\S]*id="save-layer-set"/);
  assert.match(page, /id="layers-list"[\s\S]*<footer class="layer-set-actions"/);
  assert.match(styles, /\.layer-set-actions \{[^}]*border-top:1px solid var\(--border\)/);
  assert.match(styles, /\.layer-set-actions button \{[^}]*color:var\(--text-muted\)/);
  assert.match(page, /id="load-layer-set"[\s\S]*M12 16V4M7 9l5-5 5 5M5 21h14/);
  assert.match(page, /id="save-layer-set-modal"[\s\S]*Filename[\s\S]*id="load-layer-set-modal"/);
  assert.match(projects, /manifest\.kind='layer-set'/);
  assert.match(projects, /buildManifest\(root,uploaded,true,false,true\)/);
  assert.match(projects, /if \(entry\.assetPath && !forceUpload\)/);
  assert.match(projects, /if \(!error\) \{ uploadedPaths\.push\(path\); return path; \}/);
  assert.match(projects, /if \(!response\.ok\) throw new Error\('The layer image source is no longer available\.'\)/);
  assert.match(projects, /filter\(item => item\.project_data\?\.kind === 'layer-set'\)/);
  assert.match(projects, /app\.state\.images\.push\(\.\.\.loaded\)/);
  assert.match(projects, /app\.state\.activeIndex=app\.state\.images\.length-1/);
  assert.match(projects, /scale=Math\.min\(app\.state\.width\/sourceWidth,app\.state\.height\/sourceHeight\)/);
  assert.match(projects, /x:offsetX\+entry\.x\*scale,y:offsetY\+entry\.y\*scale,width:entry\.width\*scale,height:entry\.height\*scale/);
});

test('shift-selected layers transform as one collective selection', () => {
  assert.match(editor, /if \(event\.shiftKey\) selection\.toggle\(index\)/);
  assert.match(editor, /state\.selectedIndices\.size > 1/);
  assert.match(editor, /selection\.rotate\(state\.drag\.originals,state\.drag\.bounds/);
  assert.match(editor, /selection\.resize\(state\.drag\.originals,state\.drag\.bounds,scale\)/);
  assert.match(selection, /const pivot=\{x:selectionBounds\.x\+selectionBounds\.width\/2/);
});

test('collective layer transforms preserve spacing and duplicate directly above each source', () => {
  const browser = {}; Function('window', selection)(browser);
  const state = { images:[{x:0,y:0,width:10,height:10,rotation:0,name:'A'},{x:20,y:0,width:10,height:10,rotation:0,name:'B'}], selectedIndices:new Set([0,1]), activeIndex:1, selected:'image' };
  const controller = browser.BKImageEditorSelection.create({ state, cloneEffects:value=>value });
  const bounds = controller.bounds(), originals = controller.snapshot();
  controller.rotate(originals,bounds,90);
  assert.deepEqual(state.images.map(item=>[Math.round(item.x),Math.round(item.y),item.rotation]),[[10,-10,90],[10,10,90]]);
  controller.resize(controller.snapshot(),controller.bounds(),2);
  assert.deepEqual(state.images.map(item=>[Math.round(item.width),Math.round(item.height)]),[[20,20],[20,20]]);
  controller.duplicate();
  assert.deepEqual(state.images.map(item=>item.name),['A','A copy','B','B copy']);
  assert.equal(state.images[1].x,state.images[0].x+20);
  assert.equal(state.images[3].y,state.images[2].y+20);
});
