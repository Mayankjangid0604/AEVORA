'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { CompanyAutonomyDashboard } from '../components/CompanyAutonomyDashboard';

type Tab = 'INBOX' | 'CONVERSATIONS' | 'MEETINGS' | 'NOTIFICATIONS' | 'VOICE SIMULATION';

export default function CommunicationPage() {
  const [activeTab, setActiveTab] = useState<Tab>('CONVERSATIONS');
  
  const [conversations, setConversations] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [convRes, meetRes, notifRes] = await Promise.all([
          api.conversations(),
          api.meetings(),
          api.notifications(),
        ]);

        if (convRes.error) throw new Error(convRes.error);
        if (meetRes.error) throw new Error(meetRes.error);
        if (notifRes.error) throw new Error(notifRes.error);

        setConversations(convRes.data || []);
        setMeetings(meetRes.data || []);
        setNotifications(notifRes.data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const openConversation = async (id: string) => {
    const res = await api.conversation(id);
    if (!res.error) setSelectedConv(res.data);
  };

  const openMeeting = async (id: string) => {
    const res = await api.meeting(id);
    if (!res.error) setSelectedMeeting(res.data);
  };

  const renderTabs = () => (
    <div className="flex space-x-4 mb-6 border-b border-gray-800 pb-2">
      {['CONVERSATIONS', 'MEETINGS', 'NOTIFICATIONS', 'VOICE SIMULATION'].map(tab => (
        <button
          key={tab}
          className={`font-semibold text-sm pb-1 px-2 ${activeTab === tab ? 'text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-200'}`}
          onClick={() => { setActiveTab(tab as Tab); setSelectedConv(null); setSelectedMeeting(null); }}
        >
          {tab}
        </button>
      ))}
    </div>
  );

  if (loading) return <div className="p-8">Loading communication data...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

  return (
    <div className="p-8 flex flex-col h-screen overflow-hidden">
      <div>
        <h1 className="text-2xl font-bold mb-2">Internal Communication</h1>
        <p className="text-gray-400 text-sm mb-4">Command Center &gt; Operations &gt; Communication</p>
      </div>

      {renderTabs()}

      <div className="flex-1 overflow-auto flex">
        {activeTab === 'CONVERSATIONS' && (
          <div className="flex w-full space-x-6">
            <div className="w-1/3 card overflow-y-auto">
              <h2 className="font-bold mb-4">Active Threads</h2>
              <ul className="space-y-2">
                {conversations.map(conv => (
                  <li 
                    key={conv.id} 
                    className={`p-3 rounded cursor-pointer ${selectedConv?.id === conv.id ? 'bg-slate-800 border-l-4 border-blue-500' : 'bg-slate-900 hover:bg-slate-800'}`}
                    onClick={() => openConversation(conv.id)}
                  >
                    <div className="font-semibold text-sm truncate">{conv.title || `Conversation #${conv.id.substring(0, 8)}`}</div>
                    <div className="text-xs text-gray-400 mt-1">{conv.type} • {conv.participants?.length || 0} participants</div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="w-2/3 card flex flex-col overflow-y-auto">
              {selectedConv ? (
                <>
                  <h2 className="font-bold border-b border-gray-800 pb-2 mb-4">{selectedConv.title || 'Conversation'}</h2>
                  <div className="flex-1 space-y-4">
                    {selectedConv.messages?.map((msg: any) => (
                      <div key={msg.id} className="bg-slate-900 p-3 rounded border border-gray-800">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-xs text-blue-400">{msg.senderType === 'SYSTEM' ? 'System' : (msg.senderEmployeeId ? 'Employee' : 'Chairman')}</span>
                          <span className="text-[10px] text-gray-500">{new Date(msg.createdAt).toLocaleString()}</span>
                        </div>
                        <div className="text-sm text-gray-200">{msg.content}</div>
                      </div>
                    ))}
                    {selectedConv.messages?.length === 0 && <div className="text-gray-500 text-sm">No messages.</div>}
                  </div>
                </>
              ) : (
                <div className="m-auto text-gray-500">Select a conversation to view messages.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'MEETINGS' && (
          <div className="flex w-full space-x-6">
             <div className="w-1/3 card overflow-y-auto">
              <h2 className="font-bold mb-4">Meetings</h2>
              <ul className="space-y-2">
                {meetings.map(meet => (
                  <li 
                    key={meet.id} 
                    className={`p-3 rounded cursor-pointer ${selectedMeeting?.id === meet.id ? 'bg-slate-800 border-l-4 border-purple-500' : 'bg-slate-900 hover:bg-slate-800'}`}
                    onClick={() => openMeeting(meet.id)}
                  >
                    <div className="font-semibold text-sm truncate">{meet.title}</div>
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                       <span>{meet.status}</span>
                       <span>{new Date(meet.scheduledAt).toLocaleDateString()}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="w-2/3 card flex flex-col overflow-y-auto">
              {selectedMeeting ? (
                <>
                  <h2 className="font-bold border-b border-gray-800 pb-2 mb-4 text-purple-400">{selectedMeeting.title}</h2>
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-sm bg-slate-900 p-4 rounded">
                      <div><span className="text-gray-500">Status:</span> {selectedMeeting.status}</div>
                      <div><span className="text-gray-500">Date:</span> {new Date(selectedMeeting.scheduledAt).toLocaleString()}</div>
                      <div><span className="text-gray-500">Duration:</span> {selectedMeeting.durationMinutes} min</div>
                      <div><span className="text-gray-500">Participants:</span> {selectedMeeting.participants?.length || 0}</div>
                    </div>
                    
                    <div>
                      <h3 className="font-semibold text-sm mb-2 border-b border-gray-800 pb-1">Notes</h3>
                      {selectedMeeting.notes?.length > 0 ? (
                         <ul className="list-disc pl-5 text-sm space-y-1 text-gray-300">
                           {selectedMeeting.notes.map((note: any) => <li key={note.id}>{note.content}</li>)}
                         </ul>
                      ) : <div className="text-gray-500 text-sm">No notes recorded.</div>}
                    </div>

                    <div>
                      <h3 className="font-semibold text-sm mb-2 border-b border-gray-800 pb-1">Action Items</h3>
                      {selectedMeeting.actionItems?.length > 0 ? (
                         <ul className="space-y-2">
                           {selectedMeeting.actionItems.map((ai: any) => (
                             <li key={ai.id} className="text-sm bg-slate-900 p-2 rounded flex justify-between">
                               <span>{ai.title}</span>
                               <span className="text-xs bg-gray-800 px-2 py-1 rounded">{ai.status}</span>
                             </li>
                           ))}
                         </ul>
                      ) : <div className="text-gray-500 text-sm">No action items.</div>}
                    </div>
                  </div>
                </>
              ) : (
                 <div className="m-auto text-gray-500">Select a meeting to view details.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'NOTIFICATIONS' && (
           <div className="w-full card overflow-y-auto">
             <h2 className="font-bold mb-4">System Notifications</h2>
             <div className="space-y-3">
               {notifications.map(n => (
                 <div key={n.id} className="bg-slate-900 border border-gray-800 p-4 rounded flex justify-between items-start">
                   <div>
                     <div className="font-semibold text-sm text-yellow-400 mb-1">[{n.priority}] {n.title}</div>
                     <div className="text-sm text-gray-300">{n.body}</div>
                     <div className="text-xs text-gray-500 mt-2">Target: {n.employee?.name} • {new Date(n.createdAt).toLocaleString()}</div>
                   </div>
                   {n.readAt ? (
                     <span className="text-xs text-gray-500">Read</span>
                   ) : (
                     <span className="text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded">New</span>
                   )}
                 </div>
               ))}
               {notifications.length === 0 && <div className="text-gray-500">No notifications found.</div>}
             </div>
           </div>
        )}

        {activeTab === 'VOICE SIMULATION' && (
          <div className="w-full">
            <CompanyAutonomyDashboard />
          </div>
        )}
      </div>
    </div>
  );
}
