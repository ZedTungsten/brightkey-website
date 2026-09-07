(function () {
  'use strict';

  function create(app) {
    const selected = () => [...app.state.selectedIndices].filter(index => app.state.images[index]);
    const targets = () => selected().map(index => app.state.images[index]);
    const center = item => ({ x: item.x + item.width / 2, y: item.y + item.height / 2 });
    function bounds() {
      const points = targets().flatMap(item => {
        const c = center(item), angle = (item.rotation || 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
        return [[-item.width/2,-item.height/2],[item.width/2,-item.height/2],[item.width/2,item.height/2],[-item.width/2,item.height/2]].map(([x,y]) => ({ x:c.x+x*cos-y*sin, y:c.y+x*sin+y*cos }));
      });
      if (!points.length) return null;
      const xs=points.map(point=>point.x), ys=points.map(point=>point.y);
      return { x:Math.min(...xs), y:Math.min(...ys), width:Math.max(...xs)-Math.min(...xs), height:Math.max(...ys)-Math.min(...ys) };
    }
    function selectOnly(index) { app.state.selectedIndices = new Set([index]); app.state.activeIndex=index; app.state.selected='image'; }
    function toggle(index) {
      if (app.state.selectedIndices.has(index)) app.state.selectedIndices.delete(index); else app.state.selectedIndices.add(index);
      app.state.activeIndex = app.state.selectedIndices.has(index) ? index : (selected().at(-1) ?? -1);
      app.state.selected = app.state.selectedIndices.size ? 'image' : null;
    }
    function clear() { app.state.selectedIndices.clear(); app.state.activeIndex=-1; app.state.selected=null; }
    function snapshot() { return targets().map(item => ({ item, x:item.x, y:item.y, width:item.width, height:item.height, rotation:item.rotation||0, center:center(item) })); }
    function move(originals,dx,dy) { originals.forEach(original => { original.item.x=original.x+dx; original.item.y=original.y+dy; }); }
    function rotate(originals, selectionBounds, delta) {
      const pivot={x:selectionBounds.x+selectionBounds.width/2,y:selectionBounds.y+selectionBounds.height/2}, radians=delta*Math.PI/180, cos=Math.cos(radians), sin=Math.sin(radians);
      originals.forEach(original => { const dx=original.center.x-pivot.x,dy=original.center.y-pivot.y,nx=pivot.x+dx*cos-dy*sin,ny=pivot.y+dx*sin+dy*cos; original.item.x=nx-original.width/2; original.item.y=ny-original.height/2; original.item.rotation=original.rotation+delta; });
    }
    function resize(originals, selectionBounds, scale) {
      originals.forEach(original => { const nx=selectionBounds.x+(original.center.x-selectionBounds.x)*scale,ny=selectionBounds.y+(original.center.y-selectionBounds.y)*scale; original.item.width=original.width*scale; original.item.height=original.height*scale; original.item.x=nx-original.item.width/2; original.item.y=ny-original.item.height/2; });
    }
    function duplicate() {
      const indices=selected(); if (!indices.length) return;
      const next=[]; let inserted=0;
      indices.forEach(index => { const source=app.state.images[index+inserted], copy={...source,x:source.x+20,y:source.y+20,name:`${source.name||'Image'} copy`,effects:app.cloneEffects(source.effects)}; const at=index+inserted+1; app.state.images.splice(at,0,copy); next.push(at); inserted+=1; });
      app.state.selectedIndices=new Set(next); app.state.activeIndex=next.at(-1); app.state.selected='image';
    }
    return { bounds, clear, duplicate, move, resize, rotate, selectOnly, selected, snapshot, targets, toggle };
  }
  window.BKImageEditorSelection={create};
}());
