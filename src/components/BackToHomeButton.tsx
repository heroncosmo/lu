import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';

const BackToHomeButton = () => {
  return (
    <Button asChild variant="outline" className="mb-4">
      <Link to="/">
        <Home className="h-4 w-4 mr-2" />
        Voltar ao Início
      </Link>
    </Button>
  );
};

export default BackToHomeButton;