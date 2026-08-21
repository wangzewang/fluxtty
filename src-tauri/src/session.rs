use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Idle,
    Running,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AgentType {
    None,
    Claude,
    Codex,
    Aider,
    Gemini,
    Opencode,
    Goose,
    Cursor,
    Qwen,
    Amp,
    Crush,
    Openhands,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PaneNameSource {
    Auto,
    Manual,
}

impl Default for PaneNameSource {
    fn default() -> Self {
        PaneNameSource::Auto
    }
}

/// Who created this pane. `Ai` panes are subject to the Workspace AI's
/// autonomous close decisions (see `human_touched` below); `User` panes are
/// never touched by that logic.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PaneOwner {
    User,
    Ai,
}

impl Default for PaneOwner {
    fn default() -> Self {
        PaneOwner::User
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaneInfo {
    pub id: u32,
    pub name: String,
    pub group: String,
    pub note: String,
    pub status: SessionStatus,
    pub cwd: String,
    pub tmux_session: Option<String>,
    pub name_source: PaneNameSource,
    pub agent_type: AgentType,
    pub row_index: usize,
    pub pane_index: usize,
    /// Last command submitted to the shell (captured via OSC 133;B).
    pub last_command: Option<String>,
    /// Exit code of the last completed command (captured via OSC 133;D).
    pub last_exit_code: Option<i32>,
    /// Whether the pane is currently in alternate screen mode (e.g. vim, htop).
    pub alternate_screen: bool,
    pub owner: PaneOwner,
    /// Set once a human types into an `Ai`-owned pane and never cleared —
    /// gates whether the Workspace AI may close this pane silently.
    pub human_touched: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RowInfo {
    pub pane_ids: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceLayout {
    pub rows: Vec<RowInfo>,
    pub active_pane_id: Option<u32>,
}

pub struct SessionManager {
    panes: HashMap<u32, PaneInfo>,
    layout: WorkspaceLayout,
    next_id: u32,
    shell_counter: u32,
}

impl SessionManager {
    pub fn new() -> Self {
        SessionManager {
            panes: HashMap::new(),
            layout: WorkspaceLayout {
                rows: vec![],
                active_pane_id: None,
            },
            next_id: 1,
            shell_counter: 1,
        }
    }

    pub fn create_pane(
        &mut self,
        id: u32,
        cwd: String,
        group: String,
        row_index: usize,
        tmux_session: Option<String>,
        owner: PaneOwner,
    ) -> PaneInfo {
        // Keep next_id ahead of any explicitly-assigned id to avoid future collisions
        if id >= self.next_id {
            self.next_id = id + 1;
        }
        let shell_n = self.shell_counter;
        self.shell_counter += 1;

        let pane_index = if row_index < self.layout.rows.len() {
            self.layout.rows[row_index].pane_ids.len()
        } else {
            0
        };

        let pane = PaneInfo {
            id,
            name: format!("shell-{}", shell_n),
            group,
            note: String::new(),
            status: SessionStatus::Idle,
            cwd,
            tmux_session,
            name_source: PaneNameSource::Auto,
            agent_type: AgentType::None,
            row_index,
            pane_index,
            last_command: None,
            last_exit_code: None,
            alternate_screen: false,
            owner,
            human_touched: false,
        };

        // Add to layout
        if row_index >= self.layout.rows.len() {
            self.layout.rows.push(RowInfo { pane_ids: vec![id] });
        } else {
            self.layout.rows[row_index].pane_ids.push(id);
        }

        self.panes.insert(id, pane.clone());

        if self.layout.active_pane_id.is_none() {
            self.layout.active_pane_id = Some(id);
        }

        pane
    }

    pub fn remove_pane(&mut self, id: u32) {
        self.panes.remove(&id);
        for row in &mut self.layout.rows {
            row.pane_ids.retain(|&pid| pid != id);
        }
        self.layout.rows.retain(|row| !row.pane_ids.is_empty());

        if self.layout.active_pane_id == Some(id) {
            // Set active to last pane if any
            self.layout.active_pane_id = self.panes.keys().next().copied();
        }
    }

    pub fn all_panes(&self) -> Vec<PaneInfo> {
        let mut panes: Vec<PaneInfo> = self.panes.values().cloned().collect();
        panes.sort_by_key(|p| (p.row_index, p.pane_index));
        panes
    }

    pub fn get_pane(&self, id: u32) -> Option<&PaneInfo> {
        self.panes.get(&id)
    }

    pub fn layout(&self) -> &WorkspaceLayout {
        &self.layout
    }

    pub fn set_active_pane(&mut self, id: u32) {
        if self.panes.contains_key(&id) {
            self.layout.active_pane_id = Some(id);
        }
    }

    pub fn active_pane_id(&self) -> Option<u32> {
        self.layout.active_pane_id
    }

    pub fn rename_pane(&mut self, id: u32, name: String, name_source: PaneNameSource) {
        if let Some(pane) = self.panes.get_mut(&id) {
            pane.name = name;
            pane.name_source = name_source;
        }
    }

    pub fn set_pane_group(&mut self, id: u32, group: String) {
        if let Some(pane) = self.panes.get_mut(&id) {
            pane.group = group;
        }
    }

    pub fn set_pane_status(&mut self, id: u32, status: SessionStatus) {
        if let Some(pane) = self.panes.get_mut(&id) {
            pane.status = status;
        }
    }

    pub fn set_pane_agent(&mut self, id: u32, agent_type: AgentType) {
        if let Some(pane) = self.panes.get_mut(&id) {
            pane.agent_type = agent_type;
        }
    }

    pub fn set_pane_cwd(&mut self, id: u32, cwd: String) {
        if let Some(pane) = self.panes.get_mut(&id) {
            pane.cwd = cwd;
        }
    }

    pub fn set_pane_note(&mut self, id: u32, note: String) {
        if let Some(pane) = self.panes.get_mut(&id) {
            pane.note = note;
        }
    }

    pub fn set_pane_last_command(&mut self, id: u32, cmd: String) {
        if let Some(pane) = self.panes.get_mut(&id) {
            pane.last_command = Some(cmd);
            pane.status = SessionStatus::Running;
        }
    }

    pub fn set_pane_command_done(&mut self, id: u32, exit_code: i32) {
        if let Some(pane) = self.panes.get_mut(&id) {
            pane.last_exit_code = Some(exit_code);
            pane.status = if exit_code == 0 {
                SessionStatus::Idle
            } else {
                SessionStatus::Error
            };
        }
    }

    pub fn set_pane_alternate_screen(&mut self, id: u32, active: bool) {
        if let Some(pane) = self.panes.get_mut(&id) {
            pane.alternate_screen = active;
        }
    }

    /// Record that a human typed into an AI-owned pane. No-op for user-owned
    /// panes (the flag is meaningless there) and for panes already marked.
    /// Returns true if this call actually changed state (so callers can skip
    /// emitting a redundant `session:changed`).
    pub fn mark_pane_human_touched(&mut self, id: u32) -> bool {
        if let Some(pane) = self.panes.get_mut(&id) {
            if pane.owner == PaneOwner::Ai && !pane.human_touched {
                pane.human_touched = true;
                return true;
            }
        }
        false
    }

    /// Insert a new empty row at `index` in the layout and shift all panes in
    /// subsequent rows down by one, keeping row_index values consistent with
    /// DOM order. Returns the row_index to pass to `create_pane`.
    pub fn prepare_new_row_at(&mut self, index: usize) -> usize {
        let insert_at = index.min(self.layout.rows.len());

        // Insert an empty row placeholder so create_pane adds to it at the
        // exact DOM position the frontend already chose.
        self.layout.rows.insert(insert_at, RowInfo { pane_ids: vec![] });

        for pane in self.panes.values_mut() {
            if pane.row_index >= insert_at {
                pane.row_index += 1;
            }
        }

        insert_at
    }

}

pub type SharedSessionManager = Arc<Mutex<SessionManager>>;

pub fn new_shared_session_manager() -> SharedSessionManager {
    Arc::new(Mutex::new(SessionManager::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_pane_defaults_to_user_owner() {
        let mut mgr = SessionManager::new();
        let pane = mgr.create_pane(1, "/tmp".into(), "default".into(), 0, None, PaneOwner::User);
        assert_eq!(pane.owner, PaneOwner::User);
        assert!(!pane.human_touched);
    }

    #[test]
    fn create_pane_can_be_ai_owned() {
        let mut mgr = SessionManager::new();
        let pane = mgr.create_pane(1, "/tmp".into(), "default".into(), 0, None, PaneOwner::Ai);
        assert_eq!(pane.owner, PaneOwner::Ai);
    }

    #[test]
    fn mark_pane_human_touched_flips_flag_for_ai_owned_pane() {
        let mut mgr = SessionManager::new();
        mgr.create_pane(1, "/tmp".into(), "default".into(), 0, None, PaneOwner::Ai);

        let changed = mgr.mark_pane_human_touched(1);
        assert!(changed);
        assert!(mgr.get_pane(1).unwrap().human_touched);
    }

    #[test]
    fn mark_pane_human_touched_is_idempotent() {
        let mut mgr = SessionManager::new();
        mgr.create_pane(1, "/tmp".into(), "default".into(), 0, None, PaneOwner::Ai);

        assert!(mgr.mark_pane_human_touched(1));
        // Second call: flag is already set, so this call changes nothing.
        assert!(!mgr.mark_pane_human_touched(1));
    }

    #[test]
    fn mark_pane_human_touched_is_a_no_op_for_user_owned_panes() {
        let mut mgr = SessionManager::new();
        mgr.create_pane(1, "/tmp".into(), "default".into(), 0, None, PaneOwner::User);

        let changed = mgr.mark_pane_human_touched(1);
        assert!(!changed);
        assert!(!mgr.get_pane(1).unwrap().human_touched);
    }

    #[test]
    fn mark_pane_human_touched_is_a_no_op_for_missing_pane() {
        let mut mgr = SessionManager::new();
        assert!(!mgr.mark_pane_human_touched(999));
    }
}
