# AEVORA Browser AI Worker System

## 1. Purpose

Add a Browser AI Worker subsystem to AEVORA that allows AI employees to interact with AI chatbots and other websites through locally installed Google Chrome profiles.

The browser layer is a third AI execution mechanism alongside:

1. Local LLMs through Ollama
2. Legitimate free API providers
3. Browser-based AI/web applications through Chrome

The browser layer must be controlled by the AEVORA AI Gateway and must not be hard-coded into individual employees.

---

# 2. Core Concept

The user's Chrome installation contains multiple Chrome profiles.

Each profile represents an independent browser session.

Example:

```text
Chrome
├── Profile 1 → Employee A
├── Profile 2 → Employee B
├── Profile 3 → Employee C
├── Profile 4 → Employee D
└── Profile 5 → Employee E
```

An employee assigned to a profile can use that browser session to:

* open an AI chatbot
* create a new conversation
* name the conversation after the employee
* send prompts
* read responses
* continue an existing conversation
* use websites required for its work
* build/debug/research websites and projects
* interact with web applications

The employee's browser session must remain persistent.

---

# 3. Important Safety / Account Rule

Chrome profiles are session containers, not a quota-bypass mechanism.

AEVORA must NOT:

* automatically rotate accounts to evade provider rate limits
* bypass CAPTCHA
* bypass authentication
* bypass subscription restrictions
* bypass usage limits
* create accounts automatically
* circumvent provider anti-abuse systems
* attempt to hide automation from websites

The system may use different user-owned Chrome profiles where the user has legitimately configured those profiles.

If a provider blocks or rate-limits a session, AEVORA should report the limitation and use another permitted execution path such as a local model or an available API provider.

---

# 4. Browser Worker Architecture

Implement a dedicated Browser AI subsystem:

```text
                    AEVORA
                       │
                       ▼
                 AI Gateway
                       │
             ┌─────────┼─────────┐
             │         │         │
             ▼         ▼         ▼
          Ollama     Free APIs  Browser AI
             │         │         │
             │         │         ▼
             │         │      Chrome
             │         │         │
             │         │    Chrome Profile
             │         │         │
             └─────────┴─────────┘
                       │
                       ▼
                 AI Employee
```

The Browser Worker should be exposed through a clean service interface.

---

# 5. Chrome Profile Registry

Create a browser profile registry.

Each profile should have:

```typescript
interface BrowserProfile {
  id: string;
  name: string;
  employeeId?: string;
  chromeProfileDirectory: string;
  status: 'available' | 'assigned' | 'busy' | 'error';
  browserType: 'chrome';
  enabled: boolean;
  lastUsedAt?: Date;
}
```

Example:

```json
{
  "id": "chrome-profile-01",
  "name": "Profile 1",
  "employeeId": "employee-001",
  "chromeProfileDirectory": "Profile 1",
  "browserType": "chrome",
  "status": "assigned",
  "enabled": true
}
```

Do not assume that Chrome's visible profile number is always the filesystem directory name. Detect and store the actual profile directory.

---

# 6. Employee-to-Profile Assignment

An employee can optionally have a dedicated browser profile.

Example:

```text
Employee:
Sarah - Marketing Manager

Browser Profile:
Chrome Profile 3

Status:
Assigned
```

The relationship should be stored persistently.

An employee must not unexpectedly use another employee's active browser session.

Use locking:

```text
Employee A
   ↓
Profile 1
   ↓
LOCKED
```

While Employee A is actively using Profile 1, another employee cannot use it.

---

# 7. Persistent Browser Sessions

The browser worker should support persistent Chrome sessions.

Do not launch a completely fresh temporary browser for every task.

Preferred architecture:

```text
Employee
   ↓
Browser Worker
   ↓
Chrome Profile
   ↓
Persistent Session
```

This allows:

* existing login sessions
* existing cookies
* browser settings
* previous website state
* persistent chatbot sessions

to remain available.

---

# 8. Chatbot Conversation Management

When an employee needs to use a browser-based AI chatbot:

```text
Employee
   ↓
Browser Worker
   ↓
Assigned Chrome Profile
   ↓
Open chatbot website
   ↓
Create new conversation
   ↓
Name conversation
   ↓
Send employee task
   ↓
Read response
   ↓
Return response to employee
```

The conversation name should be unique.

Recommended format:

```text
AEVORA - {Employee Name} - {Project/Task} - {Date}
```

Example:

```text
AEVORA - Alex Chen - Website Landing Page - 2026-09-29
```

Avoid using only the employee name because an employee may have multiple projects.

---

# 9. Conversation Registry

Create persistent records for browser conversations.

Example:

```typescript
interface BrowserConversation {
  id: string;
  employeeId: string;
  browserProfileId: string;
  provider: string;
  conversationTitle: string;
  conversationUrl?: string;
  projectId?: string;
  taskId?: string;
  status: 'active' | 'completed' | 'error';
  createdAt: Date;
  updatedAt: Date;
}
```

This allows AEVORA to know:

```text
Employee
   ↓
Chrome Profile
   ↓
Chatbot
   ↓
Conversation
   ↓
Project
   ↓
Task
```

---

# 10. Reusing Conversations

If an employee continues working on the same project, AEVORA should prefer continuing the employee's existing conversation when possible.

Example:

```text
Project: Website Redesign

Employee: Frontend Developer

Conversation:
AEVORA - Frontend Developer - Website Redesign
```

Next day:

```text
Frontend Developer
       ↓
Find existing conversation
       ↓
Open conversation
       ↓
Continue work
```

This provides conversational continuity.

---

# 11. New Conversation Rules

Create a new conversation when:

* the employee starts a genuinely unrelated project
* the user explicitly requests a new conversation
* the previous conversation is corrupted
* the previous conversation becomes too large
* the task requires isolation
* the provider/site does not support reliable continuation

Do not create a new chat for every small message.

---

# 12. Website / Project Development

Browser AI Workers can also work on important websites and projects.

Example:

```text
Developer Employee
       ↓
Browser AI Worker
       ↓
Chrome
       ↓
AI chatbot
       ↓
Research / planning / debugging
       ↓
Local development environment
       ↓
Project changes
```

For coding work, the browser chatbot should not be the only execution environment.

The actual project files should continue to be modified through AEVORA's development tools/agent runtime.

The browser chatbot can be used for:

* research
* architecture discussion
* debugging advice
* code review
* design suggestions
* documentation
* difficult technical reasoning
* alternative solutions

---

# 13. Browser Automation Engine

Use an existing browser automation technology rather than implementing raw mouse/keyboard automation.

Preferred options:

### Primary

Puppeteer

### Alternative

Playwright

The existing AEVORA project already contains Puppeteer, so initially use Puppeteer unless there is a strong technical reason to migrate.

The Browser Worker should abstract the automation library:

```text
BrowserWorker
     │
     ▼
BrowserAdapter
     │
     ▼
Puppeteer
     │
     ▼
Chrome
```

This allows Playwright to be introduced later without rewriting the entire system.

---

# 14. Browser Worker API

Create a service API similar to:

```typescript
interface BrowserAIWorker {
  listProfiles(): Promise<BrowserProfile[]>;

  assignProfile(
    employeeId: string,
    profileId: string
  ): Promise<void>;

  releaseProfile(
    profileId: string
  ): Promise<void>;

  openBrowser(
    profileId: string
  ): Promise<void>;

  openUrl(
    profileId: string,
    url: string
  ): Promise<void>;

  createConversation(
    employeeId: string,
    title: string
  ): Promise<BrowserConversation>;

  sendMessage(
    conversationId: string,
    message: string
  ): Promise<string>;

  continueConversation(
    conversationId: string,
    message: string
  ): Promise<string>;

  closeBrowser(
    profileId: string
  ): Promise<void>;
}
```

---

# 15. AI Gateway Integration

The Browser Worker must not be called directly by every employee.

Instead:

```text
Employee
   ↓
Agent Runtime
   ↓
AI Gateway
   ↓
Execution Router
   ├── Local Model
   ├── Free API
   └── Browser AI
```

The router determines the appropriate execution mechanism.

Example:

```text
Task:
"Summarize this internal database."

→ Local model

Task:
"Perform complex strategic analysis."

→ Free API if available

Task:
"Open this website and investigate its UI."

→ Browser Worker

Task:
"Use the browser chatbot to discuss this complex architecture."

→ Browser Worker
```

---

# 16. Browser Task Queue

Browser work should be queued.

Example:

```text
Browser Task Queue

1. Employee A → Chatbot research
2. Employee B → Website research
3. Employee C → AI coding discussion
4. Employee D → Competitor website analysis
```

Only one task should control a specific Chrome profile at a time.

Use locks to prevent simultaneous browser control.

---

# 17. Browser Task States

Use states such as:

```text
QUEUED
   ↓
ASSIGNED
   ↓
STARTING
   ↓
RUNNING
   ↓
WAITING_FOR_RESPONSE
   ↓
PROCESSING
   ↓
COMPLETED
```

Error states:

```text
AUTH_REQUIRED
RATE_LIMITED
CAPTCHA_REQUIRED
PAGE_CHANGED
BROWSER_ERROR
TIMEOUT
PROVIDER_ERROR
```

When one of these occurs, do not attempt to bypass the restriction.

Return the state to AEVORA's event/notification system.

---

# 18. Human Intervention

Some browser tasks will require the Chairman.

For example:

```text
CAPTCHA detected
      ↓
Pause task
      ↓
Notify Chairman
      ↓
Chairman completes required action
      ↓
Resume task
```

Likewise for:

* login required
* MFA required
* payment required
* security verification
* permission request

AEVORA should never attempt to circumvent these.

---

# 19. Browser Profile Management UI

Add a Browser Profiles section to the AEVORA dashboard.

Display:

```text
Browser Profiles

┌────────────────────────────────────────────┐
│ Profile 1                                  │
│ Employee: Alex Chen                       │
│ Status: 🟢 Available                      │
│ Provider: Browser AI                      │
│ Last Used: 2 minutes ago                  │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ Profile 2                                  │
│ Employee: Sarah                            │
│ Status: 🔵 Busy                           │
│ Current Task: Market Research             │
└────────────────────────────────────────────┘
```

Actions:

* Assign
* Release
* Open
* Test
* View current task
* View conversations
* Disconnect

---

# 20. Security

Never expose:

* Chrome cookies
* session tokens
* authentication credentials
* passwords
* browser profile secrets

to the LLM.

The browser worker should execute actions on behalf of the agent without exposing raw credentials.

Sensitive browser data should remain local.

---

# 21. Logging

Record browser actions at a safe level.

Example:

```text
[10:32:01] Employee: Marketing-01
[10:32:02] Profile: Chrome-03
[10:32:04] Opened chatbot
[10:32:08] Conversation created
[10:32:11] Prompt submitted
[10:32:27] Response received
[10:32:28] Task completed
```

Do NOT log passwords, cookies, access tokens, or other secrets.

---

# 22. Failure Handling

If browser AI fails:

```text
Browser AI
    ↓
Failure
    ↓
AI Gateway
    ↓
Can local model perform task?
    │
   YES
    ↓
Local model
```

or:

```text
Browser AI
    ↓
Failure
    ↓
Free API available?
    │
   YES
    ↓
Free API
```

The browser should therefore be one execution path rather than a single point of failure.

---

# 23. Final AEVORA AI Architecture

```text
                         CHAIRMAN
                             │
                             ▼
                       AI ASSISTANT
                             │
                             ▼
                            CEO
                             │
                             ▼
                      ┌──────────────┐
                      │  AI GATEWAY  │
                      └──────┬───────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
      LOCAL MODELS       FREE APIs       BROWSER AI
           │                 │                 │
        Ollama            Gemini etc.        Chrome
           │                 │                 │
           │                 │          ┌──────┴──────┐
           │                 │          │             │
           │                 │       Profile 1    Profile 2
           │                 │          │             │
           └─────────────────┼──────────┴─────────────┘
                             │
                             ▼
                       AI EMPLOYEES
                             │
                             ▼
                      COMPANY MEMORY
                             │
                             ▼
                       COMPANY STATE
```

---

# 24. Design Principle

The most important rule:

**Employees should not care which AI provider they are using.**

They should simply request intelligence:

```typescript
const result = await aiGateway.execute({
  employeeId,
  task,
  context,
  complexity,
  capabilities
});
```

The gateway decides whether the request should use:

```text
Local model
     OR
Free API
     OR
Browser AI
```

This keeps AEVORA provider-independent and allows new AI providers to be added later.
