import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { 
  Save, FileText, Search, Download, Trash2, Plus, 
  Bold, Italic, Underline, List, Hash, Calendar,
  Edit3, Eye, Code, AlignLeft, AlignCenter, AlignRight 
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Note {
  id: string;
  title: string;
  content: string;
  markdown: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
}

export function NotesEditor() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [tags, setTags] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Load notes from localStorage
  useEffect(() => {
    const savedNotes = localStorage.getItem('terminal-notes');
    if (savedNotes) {
      const parsed = JSON.parse(savedNotes);
      setNotes(parsed);
      if (parsed.length > 0) {
        setActiveNote(parsed[0]);
        setTitle(parsed[0].title);
        setContent(parsed[0].content);
        setMarkdown(parsed[0].markdown || parsed[0].content);
        setTags(parsed[0].tags?.join(', ') || '');
      }
    }
  }, []);

  // Auto-save functionality
  useEffect(() => {
    if (activeNote && isEditing) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      autoSaveTimeoutRef.current = setTimeout(() => {
        saveNote();
      }, 2000); // Auto-save after 2 seconds of inactivity
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [title, content, markdown, tags]);

  const createNewNote = () => {
    const newNote: Note = {
      id: Date.now().toString(),
      title: 'Untitled Note',
      content: '',
      markdown: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
    };
    
    const updatedNotes = [newNote, ...notes];
    setNotes(updatedNotes);
    setActiveNote(newNote);
    setTitle(newNote.title);
    setContent(newNote.content);
    setMarkdown(newNote.markdown);
    setTags('');
    setIsEditing(true);
    localStorage.setItem('terminal-notes', JSON.stringify(updatedNotes));
  };

  const saveNote = () => {
    if (!activeNote) return;

    const updatedNote: Note = {
      ...activeNote,
      title: title || 'Untitled Note',
      content,
      markdown,
      updatedAt: Date.now(),
      tags: tags.split(',').map(t => t.trim()).filter(t => t),
    };

    const updatedNotes = notes.map(n => 
      n.id === activeNote.id ? updatedNote : n
    );
    
    setNotes(updatedNotes);
    setActiveNote(updatedNote);
    localStorage.setItem('terminal-notes', JSON.stringify(updatedNotes));
    
    toast({
      description: 'Note saved',
      duration: 1000,
    });
  };

  const deleteNote = (noteId: string) => {
    const updatedNotes = notes.filter(n => n.id !== noteId);
    setNotes(updatedNotes);
    localStorage.setItem('terminal-notes', JSON.stringify(updatedNotes));
    
    if (activeNote?.id === noteId) {
      if (updatedNotes.length > 0) {
        setActiveNote(updatedNotes[0]);
        setTitle(updatedNotes[0].title);
        setContent(updatedNotes[0].content);
        setMarkdown(updatedNotes[0].markdown || updatedNotes[0].content);
        setTags(updatedNotes[0].tags?.join(', ') || '');
      } else {
        setActiveNote(null);
        setTitle('');
        setContent('');
        setMarkdown('');
        setTags('');
      }
    }
    
    toast({
      description: 'Note deleted',
      duration: 2000,
    });
  };

  const exportNote = () => {
    if (!activeNote) return;

    const noteText = `# ${activeNote.title}\n\nCreated: ${new Date(activeNote.createdAt).toLocaleString()}\nUpdated: ${new Date(activeNote.updatedAt).toLocaleString()}\nTags: ${activeNote.tags.join(', ')}\n\n---\n\n${activeNote.markdown || activeNote.content}`;
    
    const blob = new Blob([noteText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeNote.title.replace(/[^a-z0-9]/gi, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      description: 'Note exported',
      duration: 2000,
    });
  };

  const exportAllNotes = () => {
    const allNotesText = notes.map(note => 
      `# ${note.title}\n\nCreated: ${new Date(note.createdAt).toLocaleString()}\nUpdated: ${new Date(note.updatedAt).toLocaleString()}\nTags: ${note.tags.join(', ')}\n\n${note.markdown || note.content}\n\n${'='.repeat(50)}\n`
    ).join('\n');
    
    const blob = new Blob([allNotesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'all_notes.txt';
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      description: 'All notes exported',
      duration: 2000,
    });
  };

  const insertFormatting = (format: string) => {
    if (!textareaRef.current) return;

    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const selectedText = markdown.substring(start, end);
    let newText = '';
    let cursorOffset = 0;

    switch (format) {
      case 'bold':
        newText = `**${selectedText}**`;
        cursorOffset = selectedText ? newText.length : 2;
        break;
      case 'italic':
        newText = `*${selectedText}*`;
        cursorOffset = selectedText ? newText.length : 1;
        break;
      case 'underline':
        newText = `<u>${selectedText}</u>`;
        cursorOffset = selectedText ? newText.length : 3;
        break;
      case 'h1':
        newText = `# ${selectedText}`;
        cursorOffset = newText.length;
        break;
      case 'h2':
        newText = `## ${selectedText}`;
        cursorOffset = newText.length;
        break;
      case 'h3':
        newText = `### ${selectedText}`;
        cursorOffset = newText.length;
        break;
      case 'list':
        newText = `- ${selectedText}`;
        cursorOffset = newText.length;
        break;
      case 'code':
        newText = `\`${selectedText}\``;
        cursorOffset = selectedText ? newText.length : 1;
        break;
      default:
        return;
    }

    const newMarkdown = markdown.substring(0, start) + newText + markdown.substring(end);
    setMarkdown(newMarkdown);
    
    setTimeout(() => {
      textareaRef.current!.focus();
      textareaRef.current!.setSelectionRange(start + cursorOffset, start + cursorOffset);
    }, 0);
  };

  const filteredNotes = notes.filter(note => {
    const query = searchQuery.toLowerCase();
    return note.title.toLowerCase().includes(query) ||
           note.content.toLowerCase().includes(query) ||
           note.tags.some(tag => tag.toLowerCase().includes(query));
  });

  const renderMarkdown = (text: string) => {
    // Simple markdown rendering
    let html = text
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mb-2">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mb-3">$1</h1>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/<u>([^<]+)<\/u>/g, '<u>$1</u>')
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-sidebar/50 rounded text-primary">$1</code>')
      .replace(/^- (.*$)/gim, '<li class="ml-4">$1</li>')
      .replace(/\n/g, '<br/>');
    
    return <div dangerouslySetInnerHTML={{ __html: html }} className="prose prose-invert max-w-none" />;
  };

  return (
    <div className="h-full bg-card flex">
      {/* Sidebar - Notes List */}
      <div className="w-64 border-r border-primary/20 flex flex-col">
        <div className="p-2 border-b border-primary/20">
          <div className="flex gap-2 mb-2">
            <Button
              size="sm"
              onClick={createNewNote}
              className="flex-1"
              data-testid="button-new-note"
            >
              <Plus className="w-4 h-4 mr-1" />
              New Note
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exportAllNotes}
              data-testid="button-export-all"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 bg-background"
              data-testid="input-search"
            />
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2">
            {filteredNotes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No notes found</p>
              </div>
            ) : (
              filteredNotes.map((note) => (
                <Card
                  key={note.id}
                  className={`p-3 mb-2 cursor-pointer hover-elevate ${
                    activeNote?.id === note.id ? 'border-primary' : 'border-primary/20'
                  }`}
                  onClick={() => {
                    setActiveNote(note);
                    setTitle(note.title);
                    setContent(note.content);
                    setMarkdown(note.markdown || note.content);
                    setTags(note.tags?.join(', ') || '');
                  }}
                  data-testid={`note-item-${note.id}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="text-sm font-medium truncate flex-1">
                      {note.title}
                    </h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNote(note.id);
                      }}
                      className="h-5 w-5 p-0"
                      data-testid={`button-delete-${note.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {note.content.substring(0, 50)}...
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="text-xs text-primary/70">
                      <Calendar className="w-3 h-3 inline mr-1" />
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </div>
                    {note.tags.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {note.tags.length} tags
                      </div>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col">
        {activeNote ? (
          <>
            {/* Toolbar */}
            <div className="p-3 border-b border-primary/20">
              <div className="flex items-center justify-between mb-2">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-lg font-bold bg-transparent border-none focus-visible:ring-0"
                  placeholder="Note Title"
                  data-testid="input-title"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={isEditing ? 'default' : 'outline'}
                    onClick={() => setIsEditing(true)}
                    data-testid="button-edit-mode"
                  >
                    <Edit3 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={!isEditing ? 'default' : 'outline'}
                    onClick={() => setIsEditing(false)}
                    data-testid="button-preview-mode"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={saveNote}
                    data-testid="button-save"
                  >
                    <Save className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={exportNote}
                    data-testid="button-export"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {isEditing && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => insertFormatting('bold')}
                    className="h-8 w-8 p-0"
                    data-testid="button-bold"
                  >
                    <Bold className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => insertFormatting('italic')}
                    className="h-8 w-8 p-0"
                    data-testid="button-italic"
                  >
                    <Italic className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => insertFormatting('underline')}
                    className="h-8 w-8 p-0"
                    data-testid="button-underline"
                  >
                    <Underline className="w-4 h-4" />
                  </Button>
                  <div className="w-px bg-primary/20 mx-1" />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => insertFormatting('h1')}
                    className="h-8 px-2"
                    data-testid="button-h1"
                  >
                    H1
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => insertFormatting('h2')}
                    className="h-8 px-2"
                    data-testid="button-h2"
                  >
                    H2
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => insertFormatting('h3')}
                    className="h-8 px-2"
                    data-testid="button-h3"
                  >
                    H3
                  </Button>
                  <div className="w-px bg-primary/20 mx-1" />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => insertFormatting('list')}
                    className="h-8 w-8 p-0"
                    data-testid="button-list"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => insertFormatting('code')}
                    className="h-8 w-8 p-0"
                    data-testid="button-code"
                  >
                    <Code className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Content Area */}
            <div className="flex-1 p-4 overflow-auto">
              {isEditing ? (
                <Tabs defaultValue="markdown" className="h-full">
                  <TabsList className="mb-3">
                    <TabsTrigger value="markdown" data-testid="tab-markdown">Markdown</TabsTrigger>
                    <TabsTrigger value="plain" data-testid="tab-plain">Plain Text</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="markdown" className="h-[calc(100%-50px)]">
                    <Textarea
                      ref={textareaRef}
                      value={markdown}
                      onChange={(e) => setMarkdown(e.target.value)}
                      className="w-full h-full resize-none bg-background font-mono text-sm"
                      placeholder="Write your note in Markdown..."
                      data-testid="textarea-markdown"
                    />
                  </TabsContent>
                  
                  <TabsContent value="plain" className="h-[calc(100%-50px)]">
                    <Textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="w-full h-full resize-none bg-background"
                      placeholder="Write your note..."
                      data-testid="textarea-plain"
                    />
                  </TabsContent>
                </Tabs>
              ) : (
                <ScrollArea className="h-full">
                  <div className="max-w-4xl mx-auto">
                    {renderMarkdown(markdown || content)}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Tags */}
            <div className="p-3 border-t border-primary/20">
              <div className="flex items-center gap-2">
                <Label htmlFor="tags" className="text-xs">Tags:</Label>
                <Input
                  id="tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="flex-1 h-7 text-xs bg-background"
                  placeholder="Enter tags separated by commas"
                  data-testid="input-tags"
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Card className="p-8 text-center bg-card/50 border-primary/20">
              <FileText className="w-16 h-16 mx-auto mb-4 text-primary opacity-50" />
              <h2 className="text-lg font-bold mb-2">No Note Selected</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Create a new note or select an existing one to get started
              </p>
              <Button onClick={createNewNote} data-testid="button-create-first-note">
                <Plus className="w-4 h-4 mr-2" />
                Create New Note
              </Button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}