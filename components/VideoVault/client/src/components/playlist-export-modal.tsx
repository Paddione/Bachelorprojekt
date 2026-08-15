import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { PlaylistExportOptions } from '@/services/playlist-export';

interface PlaylistExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (options: PlaylistExportOptions, filename: string) => void;
    count: number;
}

export function PlaylistExportModal({ isOpen, onClose, onExport, count }: PlaylistExportModalProps) {
    const { t } = useTranslation();
    const [format, setFormat] = useState<'m3u' | 'json'>('m3u');
    const [pathType, setPathType] = useState<'absolute' | 'relative'>('absolute');
    const [filename, setFilename] = useState('playlist');

    const handleExport = () => {
        onExport({ format, pathType }, filename);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t('playlistExport.title')}</DialogTitle>
                    <DialogDescription>
                        {t('playlistExport.description', { count })}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="filename">{t('playlistExport.filename')}</Label>
                        <Input
                            id="filename"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            placeholder="playlist"
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label>{t('playlistExport.format')}</Label>
                        <RadioGroup value={format} onValueChange={(v) => setFormat(v as 'm3u' | 'json')}>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="m3u" id="m3u" />
                                <Label htmlFor="m3u">{t('playlistExport.m3u')}</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="json" id="json" />
                                <Label htmlFor="json">{t('playlistExport.json')}</Label>
                            </div>
                        </RadioGroup>
                    </div>

                    <div className="grid gap-2">
                        <Label>{t('playlistExport.pathType')}</Label>
                        <RadioGroup value={pathType} onValueChange={(v) => setPathType(v as 'absolute' | 'relative')}>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="absolute" id="absolute" />
                                <Label htmlFor="absolute">{t('playlistExport.absolutePaths')}</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="relative" id="relative" />
                                <Label htmlFor="relative">{t('playlistExport.relativePaths')}</Label>
                            </div>
                        </RadioGroup>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button onClick={handleExport}>{t('common.export')}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
