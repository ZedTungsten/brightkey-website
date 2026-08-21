'use strict';

(function () {
  const SETTING_KEY = 'customer_support_message_flow';
  const MAX_DEPTH = 12;
  const MAX_CHOICES = 12;
  const state = { sb: null, companyId: null, root: null, saving: false, sequence: 0 };
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
        const questionHeader = document.createElement('div');
        questionHeader.className = 'flow-question-header';
        const questionLabel = document.createElement('strong');
        questionLabel.textContent = `Question ${questionIndex + 1}`;
        questionHeader.append(questionLabel, deleteButton('delete-action-question', question.id, 'Delete question', 'flow-question-delete'));
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
        row.append(questionHeader, input, select);
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
      const media = document.createElement('div');
      media.className = 'flow-media-settings';
      const instructionLabel = document.createElement('label');
      instructionLabel.className = 'flow-media-instructions';
      instructionLabel.textContent = 'Instructions for the customer';
      const instructions = document.createElement('textarea');
      instructions.className = 'flow-action-input flow-media-message';
      instructions.placeholder = 'Explain what picture or video the customer should upload...';
      instructions.maxLength = 1000;
      instructions.value = action.media.instructions;
      instructions.dataset.action = 'edit-media-instructions';
      instructions.dataset.actionId = action.id;
      instructionLabel.append(instructions);
      const rules = document.createElement('div');
      rules.className = 'flow-media-rules';
      ['Always compressed', '15 MB maximum', 'Video: up to 10 seconds', 'Images: PNG, JPG or HEIC', 'Any image dimensions'].forEach(text => {
        const rule = document.createElement('span');
        rule.textContent = text;
        rules.append(rule);
      });
      media.append(instructionLabel, rules);
      card.append(media);
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
    $('save-flow').addEventListener('click', save);
  }

  document.addEventListener('DOMContentLoaded', init);
  window.BKMessageFlow = Object.freeze({ normalizeMessage });
})();
