'use strict';

window.triggerBulkDownload = async function() {
  if (selectedResourceIds.length === 0) return;

  const selectedFiles = selectedResourceIds
    .map(id => allResources.find(resource => resource.id === id))
    .filter(resource => resource?.type === 'file' && resource.file_url);

  if (selectedFiles.length === 0) {
    showToast('The selected items do not contain downloadable files.', true);
    return;
  }

  const barBtns = document.querySelectorAll('#selection-actions-bar button');
  barBtns.forEach(button => button.disabled = true);
  let downloadedCount = 0;

  try {
    for (const file of selectedFiles) {
      try {
        const response = await fetch(file.file_url);
        if (!response.ok) throw new Error('File unavailable');

        const objectUrl = URL.createObjectURL(await response.blob());
        const downloadLink = document.createElement('a');
        downloadLink.href = objectUrl;
        downloadLink.download = file.name;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        downloadedCount++;
      } catch (fileErr) {
        console.error('[Bulk Download Item Failed] ID:', file.id, fileErr);
      }
    }

    if (downloadedCount === selectedFiles.length) {
      showToast(`Downloading ${downloadedCount} file${downloadedCount === 1 ? '' : 's'}.`);
    } else if (downloadedCount > 0) {
      showToast(`Downloaded ${downloadedCount} of ${selectedFiles.length} files. Some files were unavailable.`, true);
    } else {
      showToast('The selected files could not be downloaded. Please try again.', true);
    }
  } finally {
    barBtns.forEach(button => button.disabled = false);
  }
};
