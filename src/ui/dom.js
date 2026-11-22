export function el(doc, tag, attrs = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key.startsWith('aria-')) node.setAttribute(key, String(value));
    else if (key === 'className') node.className = value;
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) if (child !== undefined && child !== null) node.append(typeof child === 'string' ? doc.createTextNode(child) : child);
  return node;
}

export function button(doc, text, action, attrs = {}) {
  return el(doc, 'button', { type: 'button', onclick: action, ...attrs }, text);
}

// Native dialogs provide focus containment and top-layer stacking. Nested dialogs
// close independently and restore their own trigger rather than the parent drawer.
export function dialog(doc, root, title, content, { trigger = root.activeElement, drawer = false, returnFocus = null } = {}) {
  const modal = el(doc, 'dialog', { className: drawer ? 'drawer' : 'modal', 'aria-label': title });
  const close = () => modal.close();
  modal.append(el(doc, 'header', {}, el(doc, 'h2', {}, title), button(doc, '×', close, { 'aria-label': 'Close ' + title })), content);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  modal.addEventListener('close', () => { modal.remove(); const target = trigger?.isConnected && !trigger.disabled ? trigger : returnFocus?.() || [...root.querySelectorAll('dialog[open]')].at(-1)?.querySelector('button:not(:disabled)') || root.querySelector('[aria-current=page]'); if (target?.isConnected) target.focus(); }, { once: true });
  root.append(modal);
  modal.showModal();
  return modal;
}

export function picker(doc, root, label, options, value, onChange) {
  const wrapper = el(doc, 'div', { className: 'picker' });
  const trigger = button(doc, options.find(o => o[0] === value)?.[1] ?? label, () => open(), { 'aria-label': label, 'aria-haspopup': 'listbox', 'aria-expanded': 'false' });
  let list = null;
  let index = Math.max(0, options.findIndex(o => o[0] === value));
  let cleanup = () => {};
  function close(focus = true) {
    if(list?.matches(':popover-open'))list.hidePopover();list?.remove(); list = null; cleanup();
    trigger.setAttribute('aria-expanded', 'false');
    if (focus) trigger.focus();
  }
  function open() {
    if (list) { close(); return; }
    list = el(doc, 'div', { role: 'listbox', 'aria-label': label, className: 'picker-list' });
    options.forEach(([key, text], i) => {
      const option = el(doc, 'button', { type: 'button', role: 'option', 'aria-selected': key === value, tabindex: i === index ? 0 : -1, onclick: () => {
        value = key; index = i; trigger.textContent = text; close(); onChange(key);
      } }, text);
      list.append(option);
    });
    wrapper.append(list);
    list.setAttribute('popover','manual');
    list.showPopover();
    const rect=trigger.getBoundingClientRect(),win=doc.defaultView,width=win.innerWidth,height=win.innerHeight;
    const below=height-rect.bottom-8,above=rect.top-8,down=below>=Math.min(240,list.scrollHeight)||below>=above;
    Object.assign(list.style,{position:'fixed',margin:'0',inset:'auto',maxWidth:Math.max(100,width-16)+'px',maxHeight:Math.max(32,Math.min(240,down?below:above))+'px',minWidth:Math.min(rect.width,width-16)+'px'});
    const box=list.getBoundingClientRect();list.style.left=Math.max(8,Math.min(rect.left,width-box.width-8))+'px';list.style.top=(down?rect.bottom+4:Math.max(8,rect.top-box.height-4))+'px';
    trigger.setAttribute('aria-expanded', 'true');
    list.children[index].focus({ preventScroll: true });
    const outside = event => { if (!event.composedPath().includes(wrapper)) close(false); };
    const scroll=event=>{if(list&&!list.contains(event.target))close(false);};
    root.addEventListener('pointerdown', outside);root.addEventListener('scroll',scroll,true);win.addEventListener('resize',closeOnResize);
    function closeOnResize(){close(false);}
    cleanup = () => {root.removeEventListener('pointerdown', outside);root.removeEventListener('scroll',scroll,true);win.removeEventListener('resize',closeOnResize);};
  }
  wrapper.addEventListener('keydown', event => {
    if (!list) {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(); }
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Tab') close();
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      for (const [i, option] of [...list.children].entries()) option.tabIndex = i === index ? 0 : -1;
      const option=list.children[index];option.focus({preventScroll:true});const top=option.offsetTop;if(top<list.scrollTop)list.scrollTop=top;else if(top+option.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=top+option.offsetHeight-list.clientHeight;
    }
  });
  wrapper.setValue=next=>{if(!options.some(o=>o[0]===next)||next===value)return;value=next;index=options.findIndex(o=>o[0]===next);trigger.textContent=options[index][1];if(list)for(const [i,n] of [...list.children].entries())n.setAttribute('aria-selected',String(options[i][0]===next));};
  wrapper.append(trigger);
  return wrapper;
}
