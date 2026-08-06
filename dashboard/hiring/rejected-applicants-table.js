'use strict';

window.BKRejectedApplicantsTable = Object.freeze({
  render(app, applications, stageCount) {
    if (!applications.length) return '';
    const questionCount = applications.reduce((maximum, application) => Math.max(maximum, Array.isArray(application.answers) ? application.answers.length : 0), 0);
    const questionHeaders = Array.from({ length: questionCount }, (_, index) => `<th>Q${index + 1}</th>`).join('');
    return `
      <div class="rejected-applicant-heading">
        <h3>Rejected Applicants</h3>
        <span>${applications.length}</span>
      </div>
      <div class="hiring-panel applicant-table-panel rejected-applicant-panel">
        <div class="hiring-table-responsive">
          <table class="hiring-table applicant-table">
            <thead><tr>
              <th>Date submitted</th>
              <th>First Name</th>
              <th>Last Name</th>
              <th>Contact Number</th>
              <th>Email</th>
              <th>Address</th>
              ${questionHeaders}
              <th>Actions</th>
            </tr></thead>
            <tbody>${applications.map(application => app.renderApplicationRow(application, questionCount, stageCount)).join('')}</tbody>
          </table>
        </div>
      </div>`;
  }
});
