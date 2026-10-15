import { useState } from "react";
import { Check, Headphones, Mail, X } from "lucide-react";
import { api } from "../../services/api-client.js";

const STEPS = [
  { id: 1, label: "Project Info" },
  { id: 2, label: "Team Members" },
  { id: 3, label: "Task Structure" },
  { id: 4, label: "Milestones & Deadlines" },
  { id: 5, label: "Review & Launch" },
];

export function ProjectSetupWizardModal({ isOpen, onClose, onProjectCreated, onShowNotice }) {
  const [currentStep, setCurrentStep] = useState(2); // default to Step 2 as shown in mockup
  const [projectName, setProjectName] = useState("Alpha Redesign 2026");
  const [projectDesc, setProjectDesc] = useState("Visual overhaul and multi-tenant permission integration.");
  const [priority, setPriority] = useState("HIGH");

  // Step 2 fields
  const [inviteEmail, setInviteEmail] = useState("");
  const [role, setRole] = useState("Project Manager");
  const [department, setDepartment] = useState("Engineering");
  const [permissionLevel, setPermissionLevel] = useState("Can Edit");
  const [personalMessage, setPersonalMessage] = useState("");
  const [invitedMembers, setInvitedMembers] = useState([]);

  // Step 3 tasks
  const [initialTaskTitle, setInitialTaskTitle] = useState("Design Initial Wireframes");

  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  function handleAddMember() {
    if (!inviteEmail.trim()) return;
    setInvitedMembers((prev) => [
      ...prev,
      { email: inviteEmail.trim(), role, department, permissionLevel, personalMessage },
    ]);
    setInviteEmail("");
    setPersonalMessage("");
  }

  async function handleLaunch() {
    try {
      setSubmitting(true);
      const res = await api.createProject({
        name: projectName.trim(),
        description: projectDesc.trim(),
        priority,
        teamMembers: invitedMembers,
        initialTasks: [
          { title: initialTaskTitle || "Kickoff Sprint Preparation", status: "TODO", priority: "HIGH" },
          { title: "Define Architecture Boundaries", status: "IN_PROGRESS", priority: "MEDIUM" },
        ],
      });

      onShowNotice({
        type: "success",
        message: `Project "${res.project.name}" created successfully with initial team & tasks.`,
      });
      onProjectCreated(res.project);
      onClose();
    } catch (err) {
      onShowNotice({ type: "error", message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (currentStep < 5) {
      if (currentStep === 2 && inviteEmail.trim()) {
        handleAddMember();
      }
      setCurrentStep(currentStep + 1);
    } else {
      handleLaunch();
    }
  }

  function handleBack() {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  }

  return (
    <div className="wizard-modal-backdrop">
      <div className="wizard-modal-container">
        {/* Left Sidebar Stepper */}
        <div className="wizard-stepper-sidebar">
          <div className="wizard-stepper-header">
            <h3>Project Setup Wizard</h3>
            <span className="wizard-progress-counter">{currentStep}/5 completed</span>
          </div>

          <div className="wizard-steps-list">
            {STEPS.map((step) => {
              const isCompleted = step.id < currentStep;
              const isActive = step.id === currentStep;

              return (
                <div
                  key={step.id}
                  className={`wizard-step-item ${isCompleted ? "completed" : ""} ${isActive ? "active" : ""}`}
                  onClick={() => setCurrentStep(step.id)}
                >
                  <div className="wizard-step-indicator">
                    {isCompleted ? (
                      <Check size={12} className="check-svg" />
                    ) : (
                      <span className="step-number-dot" />
                    )}
                  </div>
                  <span className="wizard-step-label">{step.label}</span>
                </div>
              );
            })}
          </div>

          <div className="wizard-stepper-footer">
            <button type="button" className="call-support-btn">
              <Headphones size={15} />
              <span>Call Support</span>
            </button>
          </div>
        </div>

        {/* Right Main Form Panel */}
        <div className="wizard-content-panel">
          <div className="wizard-panel-header">
            <div className="wizard-panel-titles">
              <h2>
                {currentStep === 1 && "Project Info"}
                {currentStep === 2 && "Team Members"}
                {currentStep === 3 && "Task Structure"}
                {currentStep === 4 && "Milestones & Deadlines"}
                {currentStep === 5 && "Review & Launch"}
              </h2>
              <p>
                {currentStep === 1 && "Define the project identity, scope, and priority level."}
                {currentStep === 2 && "Invite your teammates and assign their roles."}
                {currentStep === 3 && "Configure default kanban columns and kickoff tasks."}
                {currentStep === 4 && "Establish release dates and milestones."}
                {currentStep === 5 && "Review project configuration and launch into your workspace."}
              </p>
            </div>
            <button type="button" className="icon-btn-ghost" onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <div className="wizard-panel-body">
            {currentStep === 1 && (
              <div className="wizard-form-stack">
                <div className="wizard-input-group">
                  <label>Project Name</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Orion SaaS Platform"
                  />
                </div>
                <div className="wizard-input-group">
                  <label>Description</label>
                  <textarea
                    rows={3}
                    value={projectDesc}
                    onChange={(e) => setProjectDesc(e.target.value)}
                    placeholder="Purpose and goals of this project..."
                  />
                </div>
                <div className="wizard-input-group">
                  <label>Priority</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="wizard-form-stack">
                <div className="wizard-input-group">
                  <label>Invite Team Member by Email</label>
                  <div className="input-with-icon-wrapper">
                    <input
                      type="email"
                      placeholder="e.g., name@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                    <Mail size={16} className="input-right-icon" />
                  </div>
                </div>

                <div className="wizard-input-group">
                  <label>Role</label>
                  <select value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="Project Manager">Project Manager</option>
                    <option value="Team Member">Team Member</option>
                    <option value="Stakeholder">Stakeholder</option>
                  </select>
                </div>

                <div className="wizard-input-group">
                  <label>Team / Department</label>
                  <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                    <option value="Engineering">Engineering</option>
                    <option value="Design">Design</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Product">Product</option>
                  </select>
                </div>

                <div className="wizard-input-group">
                  <label>Permission Level</label>
                  <select value={permissionLevel} onChange={(e) => setPermissionLevel(e.target.value)}>
                    <option value="Full Access">Full Access</option>
                    <option value="Can Edit">Can Edit</option>
                    <option value="Read Only">Read Only</option>
                  </select>
                </div>

                <div className="wizard-input-group">
                  <label>Personal Message</label>
                  <textarea
                    rows={3}
                    placeholder="e.g., Welcome to the team! Excited to have you on board."
                    value={personalMessage}
                    onChange={(e) => setPersonalMessage(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  className="add-other-member-btn"
                  onClick={handleAddMember}
                >
                  + Add Other Member
                </button>

                {invitedMembers.length > 0 && (
                  <div className="invited-chips-list">
                    {invitedMembers.map((m, idx) => (
                      <span key={idx} className="invited-chip">
                        {m.email} ({m.role})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {currentStep === 3 && (
              <div className="wizard-form-stack">
                <div className="wizard-input-group">
                  <label>Initial Kickoff Task</label>
                  <input
                    type="text"
                    value={initialTaskTitle}
                    onChange={(e) => setInitialTaskTitle(e.target.value)}
                    placeholder="e.g. Create initial design concepts"
                  />
                </div>
                <div className="info-callout">
                  <span>Standard 4-column Kanban board will be initialized: To do, In Progress, Revision, Done.</span>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="wizard-form-stack">
                <div className="wizard-input-group">
                  <label>Target Launch Milestone</label>
                  <input type="text" defaultValue="Q4 Platform Release" />
                </div>
                <div className="wizard-input-group">
                  <label>Estimated Target Date</label>
                  <input type="date" defaultValue="2026-11-30" />
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="wizard-review-summary">
                <h4>Project Review Summary</h4>
                <div className="review-item"><strong>Name:</strong> <span>{projectName}</span></div>
                <div className="review-item"><strong>Priority:</strong> <span>{priority}</span></div>
                <div className="review-item"><strong>Invited Members:</strong> <span>{invitedMembers.length} teammates</span></div>
                <div className="review-item"><strong>Kickoff Task:</strong> <span>{initialTaskTitle}</span></div>
                <div className="info-callout">
                  <span>Upon launching, this project will be immediately visible to authorized organization members.</span>
                </div>
              </div>
            )}
          </div>

          <div className="wizard-panel-footer">
            <button
              type="button"
              className="btn-wizard-back"
              onClick={handleBack}
              disabled={currentStep === 1}
            >
              &lt; Back
            </button>
            <button
              type="button"
              className="btn-wizard-next"
              onClick={handleNext}
              disabled={submitting}
            >
              {currentStep === 5 ? (submitting ? "Launching…" : "Launch Project") : "Next >"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
