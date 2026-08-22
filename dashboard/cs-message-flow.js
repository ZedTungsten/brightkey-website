'use strict';

(function () {
  const SETTING_KEY = 'customer_support_message_flow';
  const MAX_DEPTH = 12;
  const MAX_CHOICES = 12;
  const state = {
    sb: null, companyId: null, root: null, saving: false, sequence: 0,
    previewOwner: null, previewHistory: [], previewUrls: [], previewCustomers: null,
    previewCustomer: null, previewCandidate: null, previewLoading: false
  };
  const $ = id => document.getElementById(id);
  const makeId = prefix => `${prefix}-${Date.now().toString(36)}-${(++state.sequence).toString(36)}`;
  const plusIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  const deleteIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"/></svg>';
  const gripIcon = '<svg viewBox="0 0 12 18" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/><circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="3" cy="15" r="1.5"/><circle cx="9" cy="15" r="1.5"/></svg>';
  const ACTION_TYPES = {
    qa: { label: 'Q&A', description: 'Ask questions one at a time.', icon: '<path d="M5 5h14v10H9l-4 4V5zm4 4h6m-6 3h4"/>' },
    media: { label: 'Media', description: 'Request pictures or videos.', icon: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="m7 16 4-4 3 3 2-2 4 4M9 9h.01"/>' },
    schedule: { label: 'Schedule call', description: 'Schedule a technician call.', icon: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16m-9 3h2v3h-2z"/>' },
    live: { label: 'Live support', description: 'Queue for a support person.', icon: '<path d="M8 11a4 4 0 1 1 8 0v3m-8 0v-3m-2 3h3v5H7a3 3 0 0 1-3-3v-2h2zm12 0h2v2a3 3 0 0 1-3 3h-2v-5h3z"/>' },
    resources: { label: 'Give Resources', description: 'Share support resources.', icon: '<path d="M5 4h10a4 4 0 0 1 4 4v12H8a3 3 0 0 1-3-3V4zm3 12h11M9 8h6m-6 4h6"/>' }
  };

  function blankMessage() {
    return { id: makeId('message'), text: '', next: [], choices: [], actions: [] };
  }

  function blankChoice() {
    return { id: makeId('choice'), label: '', next: null, choices: [], actions: [] };
  }

  function blankAction(type) {
    return {
      id: makeId('action'), type, questions: type === 'qa' ? [{ id: makeId('question'), text: '', answerType: 'short', choices: [] }] : [],
      media: type === 'media' ? fixedMediaSettings('') : null
    };
  }

  function fixedMediaSettings(instructions) {
    return {
      instructions: cleanText(instructions, 1000),
      accept: 'images-videos',
      maxSizeMb: 15,
      maxVideoSeconds: 10,
      imageTypes: ['image/png', 'image/jpeg', 'image/heic'],
      compress: true
    };
  }

  function cleanText(value, maxLength) {
    return typeof value === 'string' ? value.slice(0, maxLength) : '';
  }

  function normalizeChoice(value, depth) {
    if (!value || typeof value !== 'object' || depth > MAX_DEPTH) return null;
    const nextMessage = normalizeMessage(value.next, depth + 1);
    const hasNextContent = nextMessage && (
      nextMessage.text.trim() || nextMessage.next.length || nextMessage.choices.length || nextMessage.actions.length
    );
    return {
      id: cleanText(value.id, 100) || makeId('choice'),
      label: cleanText(value.label, 250),
      next: hasNextContent ? nextMessage : null,
      choices: (Array.isArray(value.choices) ? value.choices : [])
        .slice(0, MAX_CHOICES)
        .map(choice => normalizeChoice(choice, depth + 1))
        .filter(Boolean),
      actions: normalizeActions(value.actions)
    };
  }

  function normalizeMessage(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > MAX_DEPTH) return null;
    const node = {
      id: cleanText(value.id, 100) || makeId('message'),
      text: cleanText(value.text, 2000),
      next: [],
      choices: [],
      actions: normalizeActions(value.actions)
    };
    const next = Array.isArray(value.next) ? value.next.slice(0, 12) : [];
    node.next = next.map(child => normalizeMessage(child, depth + 1)).filter(Boolean);
    const choices = Array.isArray(value.choices) ? value.choices.slice(0, MAX_CHOICES) : [];
    node.choices = choices.map(choice => normalizeChoice(choice, depth + 1)).filter(Boolean);
    return node;
  }

  function normalizeActions(value) {
    return (Array.isArray(value) ? value : []).slice(0, 12).map(item => {
      const type = ACTION_TYPES[item?.type] ? item.type : null;
      if (!type) return null;
      const questions = type === 'qa' ? (Array.isArray(item.questions) ? item.questions : []).slice(0, 12).map(question => ({
        id: cleanText(question?.id, 100) || makeId('question'),
        text: cleanText(question?.text, 500),
        answerType: question?.answerType === 'choices' ? 'choices' : 'short',
        choices: (Array.isArray(question?.choices) ? question.choices : []).slice(0, 4).map(choice => cleanText(choice, 120))
      })) : [];
      const media = type === 'media' ? fixedMediaSettings(item.media?.instructions) : null;
      return { id: cleanText(item.id, 100) || makeId('action'), type, questions: type === 'qa' && !questions.length ? blankAction('qa').questions : questions, media };
    }).filter(Boolean);
  }

  function walkChoiceMessages(choice, callback, depth) {
    if (choice.next && walkMessage(choice.next, callback, choice, { type: 'choice-next' }, depth + 1)) return true;
    return choice.choices.some(child => walkChoiceMessages(child, callback, depth + 1));
  }

  function walkMessage(node, callback, parent = null, relationship = null, depth = 0) {
    if (!node || depth > MAX_DEPTH) return false;
    if (callback(node, parent, relationship, depth)) return true;
    for (let index = 0; index < node.next.length; index += 1) {
      if (walkMessage(node.next[index], callback, node, { type: 'next', index }, depth + 1)) return true;
    }
    for (let index = 0; index < node.choices.length; index += 1) {
      if (walkChoiceMessages(node.choices[index], callback, depth + 1)) return true;
    }
    return false;
  }

  function findNode(id) {
    let result = null;
    walkMessage(state.root, (node, parent, relationship, depth) => {
      if (node.id !== id) return false;
      result = { node, parent, relationship, depth };
      return true;
    });
    return result;
  }

  function button(className, label, action, id) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.dataset.action = action;
    if (id) element.dataset.id = id;
    element.append(document.createRange().createContextualFragment(plusIcon), document.createTextNode(label));
    return element;
  }

  function deleteButton(action, id, label, className = 'flow-delete') {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.dataset.action = action;
    element.dataset.id = id;
    element.setAttribute('aria-label', label);
    element.append(document.createRange().createContextualFragment(deleteIcon));
    return element;
  }

  function actionButton(targetType, targetId) {
    const element = button('flow-action flow-action-add', 'Add Actions', 'open-action-picker', targetId);
    element.dataset.targetType = targetType;
    return element;
  }

  function renderAction(action) {
    const branch = document.createElement('div');
    branch.className = 'flow-branch flow-action-branch';
    const card = document.createElement('article');
    card.className = 'flow-action-card';
    card.dataset.actionId = action.id;
    const header = document.createElement('header');
    header.className = 'flow-action-card-header';
    const title = document.createElement('span');
    title.className = 'flow-action-card-title';
    title.append(document.createRange().createContextualFragment(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ACTION_TYPES[action.type].icon}</svg>`), document.createTextNode(ACTION_TYPES[action.type].label));
    header.append(title, deleteButton('delete-flow-action', action.id, 'Delete action'));
    card.append(header);

    if (action.type === 'qa') {
      const questions = document.createElement('div');
      questions.className = 'flow-questions';
      action.questions.forEach((question, questionIndex) => {
        const row = document.createElement('div');
        row.className = 'flow-question';
        const questionLabel = document.createElement('strong');
        questionLabel.className = 'flow-question-label';
        questionLabel.textContent = `Q${questionIndex + 1}`;
        const input = document.createElement('input');
        input.className = 'flow-action-input';
        input.placeholder = 'Enter the question...';
        input.value = question.text;
        input.dataset.action = 'edit-action-question';
        input.dataset.actionId = action.id;
        input.dataset.questionId = question.id;
        const select = document.createElement('select');
        select.className = 'flow-action-select';
        select.dataset.action = 'edit-answer-type';
        select.dataset.actionId = action.id;
        select.dataset.questionId = question.id;
        select.append(new Option('Short answer', 'short'), new Option('Predefined choices', 'choices'));
        select.value = question.answerType;
        row.append(questionLabel, input, select, deleteButton('delete-action-question', question.id, 'Delete question', 'flow-question-delete'));
        if (question.answerType === 'choices') {
          const choices = document.createElement('div');
          choices.className = 'flow-answer-choices';
          for (let index = 0; index < 4; index += 1) {
            const choice = document.createElement('input');
            choice.className = 'flow-action-input';
            choice.placeholder = `Choice ${index + 1}${index > 1 ? ' (optional)' : ''}`;
            choice.value = question.choices[index] || '';
            choice.dataset.action = 'edit-answer-choice';
            choice.dataset.actionId = action.id;
            choice.dataset.questionId = question.id;
            choice.dataset.choiceIndex = String(index);
            choices.append(choice);
          }
          row.append(choices);
        }
        questions.append(row);
      });
      const addQuestion = button('flow-action flow-action-orange', 'Add Question', 'add-action-question', action.id);
      addQuestion.disabled = action.questions.length >= 12;
      card.append(questions, addQuestion);
    } else if (action.type === 'media') {
      card.classList.add('flow-media-card');
      const rules = document.createElement('div');
      rules.className = 'flow-media-rules';
      ['15 MB maximum', 'Video: up to 10 seconds', 'Images: PNG, JPG or HEIC'].forEach(text => {
        const rule = document.createElement('span');
        rule.textContent = text;
        rules.append(rule);
      });
      header.insertBefore(rules, header.lastElementChild);
      const instructions = document.createElement('textarea');
      instructions.className = 'flow-action-input flow-media-message';
      instructions.placeholder = 'Message for the customer...';
      instructions.rows = 1;
      instructions.maxLength = 1000;
      instructions.value = action.media.instructions;
      instructions.dataset.action = 'edit-media-instructions';
      instructions.dataset.actionId = action.id;
      card.append(instructions);
    } else {
      const note = document.createElement('p');
      note.className = 'flow-action-placeholder';
      note.textContent = 'Configuration will be added later.';
      card.append(note);
    }
    branch.append(card);
    return branch;
  }

  function renderChoice(choice, depth, counter) {
    const branch = document.createElement('div');
    branch.className = 'flow-branch';
    branch.dataset.choiceId = choice.id;
    const choiceRow = document.createElement('div');
    choiceRow.className = 'flow-choice';
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'flow-choice-grip';
    grip.draggable = true;
    grip.dataset.choiceId = choice.id;
    grip.setAttribute('aria-label', 'Drag to reorder choice');
    grip.title = 'Drag to reorder';
    grip.append(document.createRange().createContextualFragment(gripIcon));
    const badge = document.createElement('span');
    badge.className = 'flow-choice-badge';
    badge.textContent = 'Choice';
    const choiceInput = document.createElement('input');
    choiceInput.type = 'text';
    choiceInput.className = 'flow-choice-input';
    choiceInput.dataset.action = 'edit-choice';
    choiceInput.dataset.id = choice.id;
    choiceInput.maxLength = 250;
    choiceInput.placeholder = 'Enter the customer choice...';
    choiceInput.value = choice.label;
    choiceRow.append(grip, badge, choiceInput, deleteButton('delete-choice', choice.id, 'Delete choice', 'flow-choice-delete'));
    const choiceActions = document.createElement('div');
    choiceActions.className = 'flow-node-actions flow-choice-actions';
    const addMessageButton = button('flow-action', 'Add Message', 'add-choice-message', choice.id);
    addMessageButton.disabled = Boolean(choice.next);
    if (!choice.actions.length) {
      choiceActions.append(addMessageButton, button('flow-action', 'Add Choices', 'add-child-choice', choice.id));
    }
    if (!choice.next && !choice.choices.length) choiceActions.append(actionButton('choice', choice.id));
    branch.append(choiceRow, choiceActions);

    if (choice.choices.length || choice.next || choice.actions.length) {
      const descendants = document.createElement('div');
      descendants.className = 'flow-children flow-choice-descendants';
      choice.choices.forEach(child => descendants.append(renderChoice(child, depth + 1, counter)));
      choice.actions.forEach(action => descendants.append(renderAction(action)));
      if (choice.next) {
        const messageBranch = document.createElement('div');
        messageBranch.className = 'flow-branch';
        messageBranch.append(renderMessage(choice.next, depth + 1, counter, true));
        descendants.append(messageBranch);
      }
      branch.append(descendants);
    }
    return branch;
  }

  function renderMessage(node, depth, counter, canDelete) {
    const wrap = document.createElement('div');
    wrap.className = 'flow-node-wrap';
    const card = document.createElement('article');
    card.className = 'flow-node';
    card.dataset.messageId = node.id;

    const header = document.createElement('header');
    header.className = 'flow-node-header';
    const label = document.createElement('span');
    label.className = 'flow-node-label';
    const number = document.createElement('span');
    number.className = 'flow-node-number';
    number.textContent = String(++counter.value);
    label.append(number, document.createTextNode(depth === 0 ? 'First message' : 'Message'));
    header.append(label);
    if (canDelete) header.append(deleteButton('delete-message', node.id, 'Delete message'));

    const input = document.createElement('textarea');
    input.className = 'flow-message-input';
    input.dataset.action = 'edit-message';
    input.dataset.id = node.id;
    input.maxLength = 2000;
    input.placeholder = 'Enter the message the customer will see...';
    input.value = node.text;
    input.setAttribute('aria-label', `Message ${counter.value}`);

    const actions = document.createElement('div');
    actions.className = 'flow-node-actions';
    if (!node.actions.length) {
      actions.append(button('flow-action', 'Add Message', 'add-message', node.id), button('flow-action', 'Add Choices', 'add-choice', node.id));
    }
    if (!node.next.length && !node.choices.length) actions.append(actionButton('message', node.id));
    card.append(header, input, actions);
    wrap.append(card);

    if (node.next.length || node.choices.length || node.actions.length) {
      const children = document.createElement('div');
      children.className = 'flow-children';
      node.choices.forEach(choice => children.append(renderChoice(choice, depth + 1, counter)));
      node.actions.forEach(action => children.append(renderAction(action)));
      node.next.forEach(child => {
        const branch = document.createElement('div');
        branch.className = 'flow-branch';
        branch.append(renderMessage(child, depth + 1, counter, true));
        children.append(branch);
      });
      wrap.append(children);
    }
    return wrap;
  }

  function render() {
    const tree = $('flow-tree');
    tree.replaceChildren(renderMessage(state.root, 0, { value: 0 }, false));
    requestAnimationFrame(() => tree.querySelectorAll('.flow-media-message').forEach(autoGrowMediaMessage));
  }

  function autoGrowMediaMessage(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function showToast(message, error = false) {
    const toast = $('flow-toast');
    toast.textContent = message;
    toast.classList.toggle('error', error);
    toast.classList.add('visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('visible'), 2800);
  }

  function setStatus(message, error = false) {
    const status = $('flow-save-status');
    status.textContent = message;
    status.style.color = error ? 'var(--danger, #dc4b43)' : '';
  }

  function removeMessage(id) {
    const found = findNode(id);
    if (!found?.parent || !found.relationship) return;
    if (found.relationship.type === 'next') found.parent.next.splice(found.relationship.index, 1);
    if (found.relationship.type === 'choice-next') found.parent.next = null;
    render();
    setStatus('Unsaved');
  }

  function findChoice(id) {
    let result = null;
    const searchChoices = (choices, depth) => choices.some((choice, index) => {
      if (choice.id === id) {
        result = { choice, choices, index, depth };
        return true;
      }
      if (searchChoices(choice.choices, depth + 1)) return true;
      return choice.next ? searchMessage(choice.next, depth + 1) : false;
    });
    const searchMessage = (node, depth) => {
      if (searchChoices(node.choices, depth + 1)) return true;
      return node.next.some(child => searchMessage(child, depth + 1));
    };
    searchMessage(state.root, 0);
    return result;
  }

  function findAction(id) {
    let result = null;
    const searchActions = owner => owner.actions.some((action, index) => {
      if (action.id !== id) return false;
      result = { action, actions: owner.actions, index };
      return true;
    });
    const searchChoices = choices => choices.some(choice => searchActions(choice) || searchChoices(choice.choices) || (choice.next && searchMessage(choice.next)));
    const searchMessage = node => searchActions(node) || searchChoices(node.choices) || node.next.some(searchMessage);
    searchMessage(state.root);
    return result;
  }

  function getActionOwner(targetType, id) {
    return targetType === 'choice' ? findChoice(id)?.choice : findNode(id)?.node;
  }

  function closeActionPicker() {
    const picker = $('flow-action-picker');
    picker.hidden = true;
    picker.replaceChildren();
    state.actionTarget = null;
  }

  function openActionPicker(control) {
    const picker = $('flow-action-picker');
    picker.replaceChildren();
    const heading = document.createElement('strong');
    heading.textContent = 'Add action';
    const grid = document.createElement('div');
    grid.className = 'flow-action-picker-grid';
    Object.entries(ACTION_TYPES).forEach(([type, definition]) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'flow-action-picker-option';
      option.dataset.actionType = type;
      option.append(document.createRange().createContextualFragment(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${definition.icon}</svg>`));
      const name = document.createElement('span');
      name.textContent = definition.label;
      option.append(name);
      grid.append(option);
    });
    picker.append(heading, grid);
    state.actionTarget = { type: control.dataset.targetType, id: control.dataset.id };
    picker.hidden = false;
    const trigger = control.getBoundingClientRect();
    const bounds = picker.getBoundingClientRect();
    picker.style.left = `${Math.max(12, Math.min(window.innerWidth - bounds.width - 12, trigger.left))}px`;
    picker.style.top = `${Math.max(12, trigger.top - bounds.height - 8)}px`;
  }

  function handleClick(event) {
    const control = event.target.closest('[data-action]');
    if (!control) return;
    const found = findNode(control.dataset.id);
    if (control.dataset.action === 'open-action-picker') {
      openActionPicker(control);
      return;
    }
    if (control.dataset.action === 'add-message' && found) {
      if (found.node.actions.length) return showToast('Remove the terminal actions before adding another message.', true);
      if (found.depth >= MAX_DEPTH) return showToast('The flow has reached its maximum depth.', true);
      found.node.next.push(blankMessage());
      render();
      setStatus('Unsaved');
    } else if (control.dataset.action === 'add-choice' && found) {
      if (found.node.actions.length) return showToast('Remove the terminal actions before adding choices.', true);
      if (found.depth >= MAX_DEPTH) return showToast('The flow has reached its maximum depth.', true);
      if (found.node.choices.length >= MAX_CHOICES) return showToast('This message already has the maximum number of choices.', true);
      found.node.choices.push(blankChoice());
      render();
      setStatus('Unsaved');
    } else if (control.dataset.action === 'add-choice-message') {
      const choice = findChoice(control.dataset.id);
      if (!choice || choice.choice.next) return;
      if (choice.choice.actions.length) return showToast('Remove the terminal actions before adding another message.', true);
      if (choice.depth >= MAX_DEPTH) return showToast('The flow has reached its maximum depth.', true);
      choice.choice.next = blankMessage();
      render();
      setStatus('Unsaved');
    } else if (control.dataset.action === 'add-child-choice') {
      const choice = findChoice(control.dataset.id);
      if (!choice) return;
      if (choice.choice.actions.length) return showToast('Remove the terminal actions before adding choices.', true);
      if (choice.depth >= MAX_DEPTH) return showToast('The flow has reached its maximum depth.', true);
      if (choice.choice.choices.length >= MAX_CHOICES) return showToast('This choice already has the maximum number of next choices.', true);
      choice.choice.choices.push(blankChoice());
      render();
      setStatus('Unsaved');
    } else if (control.dataset.action === 'delete-message') {
      removeMessage(control.dataset.id);
    } else if (control.dataset.action === 'delete-choice') {
      const choice = findChoice(control.dataset.id);
      if (choice) {
        choice.choices.splice(choice.index, 1);
        render();
        setStatus('Unsaved');
      }
    } else if (control.dataset.action === 'delete-flow-action') {
      const foundAction = findAction(control.dataset.id);
      if (foundAction) {
        foundAction.actions.splice(foundAction.index, 1);
        render();
        setStatus('Unsaved');
      }
    } else if (control.dataset.action === 'add-action-question') {
      const foundAction = findAction(control.dataset.id);
      if (foundAction?.action.type === 'qa' && foundAction.action.questions.length < 12) {
        foundAction.action.questions.push({ id: makeId('question'), text: '', answerType: 'short', choices: [] });
        render();
        setStatus('Unsaved');
      }
    } else if (control.dataset.action === 'delete-action-question') {
      const foundQuestion = findQuestion(control.dataset.id);
      if (foundQuestion && foundQuestion.action.questions.length > 1) {
        foundQuestion.action.questions.splice(foundQuestion.index, 1);
        render();
        setStatus('Unsaved');
      }
    }
  }

  function findQuestion(id) {
    let result = null;
    const searchOwner = owner => owner.actions.some(action => action.questions.some((question, index) => {
      if (question.id !== id) return false;
      result = { action, question, index };
      return true;
    }));
    const searchChoices = choices => choices.some(choice => searchOwner(choice) || searchChoices(choice.choices) || (choice.next && searchMessage(choice.next)));
    const searchMessage = node => searchOwner(node) || searchChoices(node.choices) || node.next.some(searchMessage);
    searchMessage(state.root);
    return result;
  }

  function handleActionPickerClick(event) {
    const option = event.target.closest('[data-action-type]');
    if (!option || !state.actionTarget) return;
    const owner = getActionOwner(state.actionTarget.type, state.actionTarget.id);
    if (!owner) return closeActionPicker();
    if (owner.next && (Array.isArray(owner.next) ? owner.next.length : true) || owner.choices.length) {
      closeActionPicker();
      return showToast('Actions can only be added at the end of a flow branch.', true);
    }
    if (owner.actions.length >= 12) {
      closeActionPicker();
      return showToast('This step already has the maximum number of actions.', true);
    }
    owner.actions.push(blankAction(option.dataset.actionType));
    closeActionPicker();
    render();
    setStatus('Unsaved');
  }

  function handleInput(event) {
    const action = event.target.dataset.action;
    if (action === 'edit-message') {
      const found = findNode(event.target.dataset.id);
      if (found) found.node.text = event.target.value;
    } else if (action === 'edit-choice') {
      const found = findChoice(event.target.dataset.id);
      if (found) found.choice.label = event.target.value;
    } else if (action === 'edit-action-question') {
      const found = findAction(event.target.dataset.actionId);
      const question = found?.action.questions.find(item => item.id === event.target.dataset.questionId);
      if (question) question.text = event.target.value.slice(0, 500);
    } else if (action === 'edit-answer-choice') {
      const found = findAction(event.target.dataset.actionId);
      const question = found?.action.questions.find(item => item.id === event.target.dataset.questionId);
      if (question) question.choices[Number(event.target.dataset.choiceIndex)] = event.target.value.slice(0, 120);
    } else if (action === 'edit-media-instructions') {
      const found = findAction(event.target.dataset.actionId);
      if (found?.action.media) found.action.media.instructions = event.target.value.slice(0, 1000);
      autoGrowMediaMessage(event.target);
    } else return;
    setStatus('Unsaved');
  }

  function handleChange(event) {
    const action = event.target.dataset.action;
    const found = findAction(event.target.dataset.actionId);
    if (!found) return;
    if (action === 'edit-answer-type') {
      const question = found.action.questions.find(item => item.id === event.target.dataset.questionId);
      if (!question) return;
      question.answerType = event.target.value === 'choices' ? 'choices' : 'short';
      if (question.answerType === 'choices' && !question.choices.length) question.choices = ['', ''];
      render();
    } else return;
    setStatus('Unsaved');
  }

  function handleDragStart(event) {
    const grip = event.target.closest('.flow-choice-grip');
    if (!grip) return;
    state.dragChoiceId = grip.dataset.choiceId;
    grip.closest('.flow-branch')?.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', state.dragChoiceId);
  }

  function handleDragOver(event) {
    const targetBranch = event.target.closest('.flow-branch[data-choice-id]');
    if (!targetBranch || !state.dragChoiceId || targetBranch.dataset.choiceId === state.dragChoiceId) return;
    const source = findChoice(state.dragChoiceId);
    const target = findChoice(targetBranch.dataset.choiceId);
    if (!source || !target || source.choices !== target.choices) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.flow-branch.drop-before, .flow-branch.drop-after')
      .forEach(branch => branch.classList.remove('drop-before', 'drop-after'));
    const bounds = targetBranch.getBoundingClientRect();
    targetBranch.classList.add(event.clientY < bounds.top + bounds.height / 2 ? 'drop-before' : 'drop-after');
  }

  function handleDrop(event) {
    const targetBranch = event.target.closest('.flow-branch[data-choice-id]');
    if (!targetBranch || !state.dragChoiceId) return;
    const source = findChoice(state.dragChoiceId);
    const target = findChoice(targetBranch.dataset.choiceId);
    if (!source || !target || source.choices !== target.choices || source.index === target.index) return;
    event.preventDefault();
    const bounds = targetBranch.getBoundingClientRect();
    const placeAfter = event.clientY >= bounds.top + bounds.height / 2;
    const [moved] = source.choices.splice(source.index, 1);
    let destination = target.index + (placeAfter ? 1 : 0);
    if (source.index < destination) destination -= 1;
    source.choices.splice(destination, 0, moved);
    render();
    setStatus('Unsaved');
  }

  function handleDragEnd() {
    state.dragChoiceId = null;
    document.querySelectorAll('.flow-branch.dragging, .flow-branch.drop-before, .flow-branch.drop-after')
      .forEach(branch => branch.classList.remove('dragging', 'drop-before', 'drop-after'));
  }

  function previewElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function previewOption(label, action, id) {
    const option = previewElement('button', 'flow-preview-option', label);
    option.type = 'button';
    option.dataset.previewAction = action;
    if (id) option.dataset.previewId = id;
    return option;
  }
  function splitPurchasedValues(value) {
    return String(value || '').split('|').map(item => item.trim()).filter(Boolean);
  }
  function customerPreviewKey(order) {
    const phone = String(order.customer_phone || '').replace(/\D/g, '');
    const email = String(order.customer_email || '').trim().toLowerCase();
    const name = [order.customer_first_name, order.customer_last_name].filter(Boolean).join(' ').trim()
      || String(order.customer_name || '').trim();
    return phone ? `phone:${phone}` : email ? `email:${email}` : `name:${name.toLowerCase()}`;
  }
  function customerPreviewName(order) {
    return [order.customer_first_name, order.customer_last_name].filter(Boolean).join(' ').trim()
      || String(order.customer_name || '').trim()
      || 'Unnamed customer';
  }
  async function loadPreviewCustomers() {
    if (state.previewCustomers) return state.previewCustomers;
    if (state.previewLoading) return [];
    state.previewLoading = true;
    try {
      const { data: orders, error } = await state.sb.from('installation_bookings')
        .select('id,order_no,customer_name,customer_first_name,customer_last_name,customer_phone,customer_email,product_skus,product_qtys,created_at')
        .eq('company_id', state.companyId)
        .not('order_no', 'ilike', 'DO-%')
        .order('created_at', { ascending: false })
        .limit(250);
      if (error) throw error;
      const purchasedSkus = [...new Set((orders || []).flatMap(order => splitPurchasedValues(order.product_skus)))].slice(0, 100);
      let productMap = new Map();
      if (purchasedSkus.length) {
        const { data: products, error: productError } = await state.sb.from('products')
          .select('id,sku,title,image_main')
          .eq('company_id', state.companyId)
          .in('sku', purchasedSkus)
          .limit(100);
        if (productError) throw productError;
        productMap = new Map((products || []).map(product => [String(product.sku), product]));
      }
      const grouped = new Map();
      (orders || []).forEach(order => {
        const key = customerPreviewKey(order);
        if (!key || key === 'name:') return;
        if (!grouped.has(key)) grouped.set(key, {
          id: key, name: customerPreviewName(order), phone: order.customer_phone || '',
          email: order.customer_email || '', products: new Map()
        });
        const customer = grouped.get(key);
        splitPurchasedValues(order.product_skus).forEach((sku, index) => {
          const product = productMap.get(sku);
          const productKey = product?.id || sku;
          if (!customer.products.has(productKey)) customer.products.set(productKey, {
            id: productKey, sku, title: product?.title || sku,
            orderNo: order.order_no || '', quantity: Number.parseInt(splitPurchasedValues(order.product_qtys)[index], 10) || 1
          });
        });
      });
      state.previewCustomers = [...grouped.values()].map(customer => ({ ...customer, products: [...customer.products.values()] }))
        .sort((left, right) => left.name.localeCompare(right.name));
      return state.previewCustomers;
    } finally {
      state.previewLoading = false;
    }
  }
  function previewPortalHeading() {
    const heading = previewElement('div', 'flow-preview-view-heading');
    heading.append(previewElement('span', '', 'Help Center'), previewElement('h2', '', 'Support'));
    return heading;
  }
  function renderPreviewCustomerPicker(customers, errorMessage = '') {
    state.previewCustomer = null; state.previewCandidate = null; state.previewOwner = null;
    const content = $('flow-customer-preview-content');
    content.replaceChildren();
    if (errorMessage || !customers.length) {
      content.append(previewElement('div', 'flow-preview-empty', errorMessage || 'No customers with purchased products were found.'));
      return;
    }
    const picker = previewElement('section', 'flow-preview-customer-picker');
    const label = previewElement('label', '', 'Type a customer name, phone number, or email');
    const input = document.createElement('input'); input.id = 'flow-preview-customer'; input.type = 'search';
    input.placeholder = 'Search customer...'; input.autocomplete = 'off';
    const results = previewElement('div', 'flow-preview-customer-results');
    const button = previewElement('button', '', 'Preview customer flow');
    button.type = 'button'; button.dataset.previewAction = 'customer'; button.disabled = true;
    const showResults = () => {
      const term = input.value.trim().toLowerCase(); results.replaceChildren(); state.previewCandidate = null; button.disabled = true;
      if (!term) return;
      customers.filter(customer => [customer.name, customer.phone, customer.email].join(' ').toLowerCase().includes(term)).slice(0, 8).forEach(customer => {
        const result = previewElement('button', 'flow-preview-customer-result'); result.type = 'button'; result.dataset.previewCustomerId = customer.id;
        result.append(previewElement('strong', '', customer.name), previewElement('span', '', customer.phone || customer.email || 'Customer'));
        results.append(result);
      });
      if (!results.childElementCount) results.append(previewElement('div', 'flow-preview-empty', 'No matching customer found.'));
    };
    input.addEventListener('input', showResults);
    results.addEventListener('click', event => {
      const result = event.target.closest('[data-preview-customer-id]'); if (!result) return;
      state.previewCandidate = customers.find(customer => customer.id === result.dataset.previewCustomerId) || null;
      input.value = state.previewCandidate?.name || ''; results.replaceChildren(); button.disabled = !state.previewCandidate;
    });
    picker.append(label, input, results, button);
    content.append(picker);
    input.focus();
  }
  function renderPreviewAction(action) {
    const card = previewElement('section', 'flow-preview-action');
    card.append(previewElement('strong', '', ACTION_TYPES[action.type]?.label || 'Action'));
    if (action.type === 'qa') {
      action.questions.forEach((question, index) => {
        const label = previewElement('label', '', question.text || `Question ${index + 1}`);
        if (question.answerType === 'choices') {
          const select = document.createElement('select');
          select.append(new Option('Select an answer', ''));
          question.choices.filter(Boolean).forEach(choice => select.append(new Option(choice, choice)));
          label.append(select);
        } else {
          const input = document.createElement('input');
          input.type = 'text';
          input.placeholder = 'Type your answer...';
          label.append(input);
        }
        card.append(label);
      });
    } else if (action.type === 'media') {
      const upload = previewElement('label', 'flow-preview-upload', 'Choose photos or videos');
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*,video/*'; input.multiple = true;
      input.dataset.previewUpload = 'true';
      upload.append(input);
      card.append(upload, previewElement('div', 'flow-preview-files'));
    } else {
      card.append(previewOption(`Try ${ACTION_TYPES[action.type]?.label || 'action'}`, 'local-action', action.id));
    }
    return card;
  }
  function renderPreviewOwner(owner, customerText = '') {
    state.previewOwner = owner;
    const content = $('flow-preview-content');
    content.replaceChildren();
    if (customerText) content.append(previewElement('div', 'flow-preview-bubble customer', customerText));
    if (owner?.text) content.append(previewElement('div', 'flow-preview-bubble', owner.text));
    (owner?.actions || []).forEach(action => content.append(renderPreviewAction(action)));
    const options = previewElement('div', 'flow-preview-options');
    (owner?.choices || []).forEach(choice => options.append(previewOption(choice.label || 'Untitled choice', 'choice', choice.id)));
    (owner?.next || []).forEach((node, index) => options.append(previewOption(owner.next.length === 1 ? 'Continue' : `Continue ${index + 1}`, 'node', node.id)));
    if (options.childElementCount) content.append(options);
    if (!owner?.text && !owner?.actions?.length && !options.childElementCount) content.append(previewElement('p', 'flow-preview-system', 'This branch has no customer-facing content yet.'));
    $('flow-preview-back').disabled = !state.previewCustomer && state.previewHistory.length === 0;
  }
  function renderPreviewProductStep() {
    state.previewOwner = null;
    const content = $('flow-preview-content');
    content.replaceChildren(
      previewPortalHeading(),
      previewElement('p', 'flow-preview-system', 'Select the ordered product you need support with.'),
      previewElement('div', 'flow-preview-bubble', 'Which ordered product do you need help with?')
    );
    const options = previewElement('div', 'flow-preview-options');
    (state.previewCustomer?.products || []).forEach(product => options.append(previewOption(
      `${product.title}${product.orderNo ? ` · ${product.orderNo}` : ''}`,
      'product', product.id
    )));
    if (!options.childElementCount) content.append(previewElement('div', 'flow-preview-empty', 'This customer has no purchased products available for Support.'));
    content.append(options);
    $('flow-preview-back').disabled = false;
  }
  async function openPreview() {
    if (!state.root) return;
    state.previewHistory = [];
    const modal = $('flow-customer-preview-modal');
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('open');
    $('close-customer-preview').focus();
    $('flow-customer-preview-content').replaceChildren(previewElement('div', 'flow-preview-empty', 'Loading customers and their purchases...'));
    try {
      renderPreviewCustomerPicker(await loadPreviewCustomers());
    } catch (error) {
      console.error('Preview customers could not be loaded:', error);
      renderPreviewCustomerPicker([], 'Customers and purchases could not be loaded. Please try again.');
    }
  }
  function closeCustomerPreview() {
    const modal = $('flow-customer-preview-modal'); modal.classList.remove('open');
    window.setTimeout(() => { modal.style.display = 'none'; }, 180);
  }
  function showFlowPreview() {
    const modal = $('flow-preview-modal'); modal.style.display = 'flex'; modal.offsetHeight; modal.classList.add('open');
    $('close-flow-preview').focus();
  }
  function returnToCustomerPicker() {
    closePreview(); renderPreviewCustomerPicker(state.previewCustomers || []);
    const modal = $('flow-customer-preview-modal'); modal.style.display = 'flex'; modal.offsetHeight; modal.classList.add('open');
  }

  function closePreview() {
    state.previewUrls.forEach(url => URL.revokeObjectURL(url));
    state.previewUrls = [];
    const modal = $('flow-preview-modal');
    modal.classList.remove('open');
    window.setTimeout(() => { modal.style.display = 'none'; }, 180);
  }

  function handlePreviewClick(event) {
    const trigger = event.target.closest('[data-preview-action]');
    if (!trigger) return;
    const action = trigger.dataset.previewAction;
    if (action === 'customer') {
      const customer = state.previewCandidate;
      if (!customer) return;
      state.previewCustomer = customer;
      $('flow-preview-greeting').textContent = `Hello, ${customer.name.split(/\s+/)[0]}`;
      state.previewHistory = [];
      closeCustomerPreview(); showFlowPreview();
      renderPreviewProductStep();
    } else if (action === 'product') {
      state.previewHistory = [];
      renderPreviewOwner(state.root, trigger.textContent.trim());
    } else if (action === 'choice') {
      const found = findChoice(trigger.dataset.previewId);
      if (!found) return;
      state.previewHistory.push(state.previewOwner);
      renderPreviewOwner(found.choice, found.choice.label);
    } else if (action === 'node') {
      const found = findNode(trigger.dataset.previewId);
      if (!found) return;
      state.previewHistory.push(state.previewOwner);
      renderPreviewOwner(found.node);
    } else if (action === 'local-action') {
      const note = previewElement('p', 'flow-preview-local-note', 'Preview interaction only. No request was submitted.');
      trigger.parentElement.append(note);
      trigger.disabled = true;
    }
  }

  function handlePreviewUpload(event) {
    if (!event.target.matches('[data-preview-upload]')) return;
    const files = Array.from(event.target.files || []);
    const list = event.target.closest('.flow-preview-action').querySelector('.flow-preview-files');
    list.replaceChildren();
    files.forEach(file => {
      const item = previewElement('div', 'flow-preview-file');
      const url = URL.createObjectURL(file);
      state.previewUrls.push(url);
      if (file.type.startsWith('image/')) {
        const image = document.createElement('img'); image.src = url; image.alt = '';
        item.append(image);
      } else if (file.type.startsWith('video/')) {
        const video = document.createElement('video'); video.src = url; video.muted = true;
        item.append(video);
      }
      item.append(document.createTextNode(file.name));
      list.append(item);
    });
  }

  async function save() {
    if (state.saving || !state.companyId) return;
    state.saving = true;
    $('save-flow').disabled = true;
    setStatus('Saving...');
    try {
      const { error } = await state.sb.from('global_settings').upsert({
        company_id: state.companyId,
        key: SETTING_KEY,
        value: { version: 1, root: state.root }
      }, { onConflict: 'key, company_id' });
      if (error) throw error;
      setStatus('Saved');
      showToast('Message flow saved.');
    } catch (error) {
      console.error('Message flow could not be saved:', error);
      setStatus('Save failed', true);
      showToast('Message flow could not be saved. Please try again.', true);
    } finally {
      state.saving = false;
      $('save-flow').disabled = false;
    }
  }

  async function init() {
    const auth = await window.BKAuth.checkRoleGate(['Customer Service'], '/admin.html');
    if (!auth) return;
    state.sb = window.BKAuth.sb;
    const { data: company, error: companyError } = await state.sb.from('companies')
      .select('id').eq('tenant_id', auth.tenantId).limit(1).maybeSingle();
    if (companyError || !company?.id) {
      $('flow-loading').textContent = 'Company access could not be verified.';
      return;
    }
    state.companyId = company.id;
    try {
      const { data, error } = await state.sb.from('global_settings')
        .select('value').eq('company_id', state.companyId).eq('key', SETTING_KEY).maybeSingle();
      if (error) throw error;
      state.root = normalizeMessage(data?.value?.root) || blankMessage();
      $('flow-loading').hidden = true;
      $('flow-tree').hidden = false;
      render();
      $('preview-flow').disabled = false;
    } catch (error) {
      console.error('Message flow could not be loaded:', error);
      $('flow-loading').textContent = 'Message flow could not be loaded. Refresh and try again.';
      return;
    }
    $('flow-tree').addEventListener('click', handleClick);
    $('flow-tree').addEventListener('input', handleInput);
    $('flow-tree').addEventListener('change', handleChange);
    $('flow-tree').addEventListener('dragstart', handleDragStart);
    $('flow-tree').addEventListener('dragover', handleDragOver);
    $('flow-tree').addEventListener('drop', handleDrop);
    $('flow-tree').addEventListener('dragend', handleDragEnd);
    $('flow-action-picker').addEventListener('click', handleActionPickerClick);
    document.addEventListener('pointerdown', event => {
      if (!$('flow-action-picker').hidden && !event.target.closest('#flow-action-picker, [data-action="open-action-picker"]')) closeActionPicker();
    });
    window.addEventListener('resize', closeActionPicker);
    window.addEventListener('scroll', closeActionPicker, true);
    $('preview-flow').addEventListener('click', openPreview);
    $('close-customer-preview').addEventListener('click', closeCustomerPreview);
    $('close-flow-preview').addEventListener('click', closePreview);
    $('flow-customer-preview-content').addEventListener('click', handlePreviewClick);
    $('flow-preview-content').addEventListener('click', handlePreviewClick);
    $('flow-preview-content').addEventListener('change', handlePreviewUpload);
    $('flow-preview-back').addEventListener('click', () => {
      const previous = state.previewHistory.pop();
      if (previous) renderPreviewOwner(previous);
      else if (state.previewOwner) renderPreviewProductStep();
      else if (state.previewCustomer) returnToCustomerPicker();
    });
    $('flow-preview-restart').addEventListener('click', () => {
      state.previewHistory = [];
      returnToCustomerPicker();
    });
    $('flow-preview-modal').addEventListener('click', event => { if (event.target === $('flow-preview-modal')) closePreview(); });
    $('flow-customer-preview-modal').addEventListener('click', event => { if (event.target === $('flow-customer-preview-modal')) closeCustomerPreview(); });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if ($('flow-preview-modal').classList.contains('open')) closePreview();
      else if ($('flow-customer-preview-modal').classList.contains('open')) closeCustomerPreview();
    });
    $('save-flow').addEventListener('click', save);
  }

  document.addEventListener('DOMContentLoaded', init);
  window.BKMessageFlow = Object.freeze({ normalizeMessage });
})();
