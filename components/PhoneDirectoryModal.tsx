import React, { useState } from 'react';
import type { Person, NavigationApp } from '../types';
import { PersonRole } from '../types';
import { CloseIcon, EditIcon, PlusIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';

interface ManagePeopleModalProps {
  people: Person[];
  onAdd: (person: Omit<Person, 'id'>) => void;
  onUpdate: (person: Person) => void;
  onDelete: (personId: number) => void;
  onClose: () => void;
}

const PersonForm: React.FC<{
    person: Omit<Person, 'id'> | Person;
    onSave: (person: Omit<Person, 'id'> | Person) => void;
    onCancel: () => void;
}> = ({ person, onSave, onCancel }) => {
    const { t } = useTranslation();
    const [formData, setFormData] = useState(person);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.name.trim() && formData.phone.trim()) {
            onSave(formData);
        } else {
            alert(t('people.validation.nameAndPhoneRequired'));
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-4 bg-slate-700 rounded-lg mt-4 space-y-4">
            <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder={t('people.fields.name')} className="w-full bg-slate-800 border border-slate-600 rounded-md py-2 px-3 text-white" required />
            <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder={t('people.fields.phone')} className="w-full bg-slate-800 border border-slate-600 rounded-md py-2 px-3 text-white" required />
            <select name="role" value={formData.role} onChange={handleChange} className="w-full bg-slate-800 border border-slate-600 rounded-md py-2 px-3 text-white">
                {Object.values(PersonRole).map(role => <option key={role} value={role}>{t(`personRole.${role}`)}</option>)}
            </select>
            {formData.role === PersonRole.Driver && (
                <select name="navigationApp" value={formData.navigationApp || 'google'} onChange={handleChange} className="w-full bg-slate-800 border border-slate-600 rounded-md py-2 px-3 text-white">
                    <option value="google">Google Maps</option>
                    <option value="waze">Waze</option>
                </select>
            )}
            <div className="flex justify-end space-x-2">
                <button type="button" onClick={onCancel} className="px-3 py-1 text-sm rounded-md bg-slate-600 hover:bg-slate-500">{t('general.cancel')}</button>
                <button type="submit" className="px-3 py-1 text-sm rounded-md bg-amber-600 hover:bg-amber-700">{t('general.save')}</button>
            </div>
        </form>
    );
};

export const ManagePeopleModal: React.FC<ManagePeopleModalProps> = ({ people, onAdd, onUpdate, onDelete, onClose }) => {
    const { t, language } = useTranslation();
    const [editingPerson, setEditingPerson] = useState<Person | null>(null);
    const [isAdding, setIsAdding] = useState(false);

    console.log('People data:', people);

    const handleSave = (personData: Omit<Person, 'id'> | Person) => {
        if ('id' in personData) {
            onUpdate(personData as Person);
        } else {
            onAdd(personData);
        }
        setEditingPerson(null);
        setIsAdding(false);
    };
    
    const renderCategory = (role: PersonRole) => {
        const filteredPeople = people.filter(p => p.role === role).sort((a,b) => a.name.localeCompare(b.name, language));
        console.log(`Role ${role}:`, filteredPeople.length, 'people');
        return (
            <section key={role}>
                <h3 className="text-lg font-semibold text-amber-400 border-b border-slate-700 pb-2 mb-2 capitalize">{t(`personRolePlural.${role}`)}</h3>
                <ul>
                    {filteredPeople.map(person => (
                        editingPerson?.id === person.id ? (
                            <li key={person.id}><PersonForm person={editingPerson} onSave={handleSave} onCancel={() => setEditingPerson(null)} /></li>
                        ) : (
                             <li key={person.id} className="flex justify-between items-center py-2 group">
                                 <div>
                                     <span className="text-gray-200">{person.name}</span>
                                     <p className="font-mono text-sm text-gray-400">{person.phone}</p>
                                     {person.role === PersonRole.Driver && (
                                         <p className="text-xs text-gray-500">Nav: {person.navigationApp === 'waze' ? 'Waze' : 'Google'}</p>
                                     )}
                                 </div>
                                <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => setEditingPerson(person)} className="p-1 text-amber-400 hover:text-amber-300"><EditIcon size={18}/></button>
                                    <button onClick={() => onDelete(person.id)} className="p-1 text-red-500 hover:text-red-400"><CloseIcon size={18}/></button>
                                </div>
                            </li>
                        )
                    ))}
                </ul>
            </section>
        );
    };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4 animate-fade-in" role="dialog" aria-modal="true">
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-md relative">
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold">{t('people.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon /></button>
        </div>
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {Object.values(PersonRole).map(role => renderCategory(role))}
            {isAdding && <PersonForm person={{name: '', phone: '', role: PersonRole.Driver}} onSave={handleSave} onCancel={() => setIsAdding(false)}/>}
        </div>
        <div className="flex justify-between items-center p-6 bg-slate-900 border-t border-slate-700 rounded-b-lg">
             <button onClick={() => setIsAdding(true)} disabled={isAdding || !!editingPerson} className="flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-md bg-amber-600 hover:bg-amber-700 disabled:bg-slate-500 disabled:cursor-not-allowed"><PlusIcon/><span>{t('people.addPerson')}</span></button>
             <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md bg-slate-600 hover:bg-slate-500">{t('general.close')}</button>
        </div>
      </div>
    </div>
  );
};