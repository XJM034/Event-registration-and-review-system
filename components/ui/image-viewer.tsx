'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RotateCw, ZoomIn, ZoomOut, X } from 'lucide-react'

interface ImageViewerProps {
  src: string
  alt: string
  isOpen: boolean
  onClose: () => void
}

export function ImageViewer({ src, alt, isOpen, onClose }: ImageViewerProps) {
  const [rotation, setRotation] = useState(0)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (!isOpen) {
      setRotation(0)
      setScale(1)
    }
  }, [isOpen])

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360)
  }

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 3))
  }

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <div className="sr-only">
          <DialogTitle>图片查看器</DialogTitle>
        </div>
        <div className="relative bg-black rounded-lg overflow-hidden">
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            <Button
              size="icon"
              variant="secondary"
              onClick={handleZoomOut}
              className="bg-white/90 hover:bg-white"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              onClick={handleZoomIn}
              className="bg-white/90 hover:bg-white"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              onClick={handleRotate}
              className="bg-white/90 hover:bg-white"
            >
              <RotateCw className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              onClick={onClose}
              className="bg-white/90 hover:bg-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center justify-center p-8 min-h-[400px]">
            <img
              src={src}
              alt={alt}
              style={{
                transform: `rotate(${rotation}deg) scale(${scale})`,
                transition: 'transform 0.3s ease',
                maxWidth: '100%',
                maxHeight: '70vh',
                objectFit: 'contain'
              }}
              className="select-none"
              draggable={false}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}