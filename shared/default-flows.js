/**
 * Fluxos de exemplo (seed) para demonstração.
 * O administrador pode editar, remover ou adicionar novos na página de opções.
 *
 * Estrutura de um fluxo:
 * {
 *   id: string,
 *   processType: string,      // nome EXATO do "Tipo do Processo" no SEI
 *   description: string,
 *   active: boolean,
 *   steps: [
 *     { id: string, order: number, name: string, description?: string, unit?: string }
 *   ]
 * }
 */
const SEI_FLUXO_DEFAULTS = [
  {
    id: "flow-ferias",
    processType: "Férias",
    description: "Fluxo padrão de solicitação e concessão de férias.",
    active: true,
    steps: [
      {
        id: "s1",
        order: 1,
        name: "Abertura do processo",
        description: "Servidor ou RH protocola o pedido de férias com período desejado.",
        unit: "Unidade de origem"
      },
      {
        id: "s2",
        order: 2,
        name: "Análise da chefia imediata",
        description: "Chefia valida disponibilidade da equipe e aprova ou devolve o pedido.",
        unit: "Chefia imediata"
      },
      {
        id: "s3",
        order: 3,
        name: "Análise do RH / gestão de pessoas",
        description: "Conferência de saldo de férias, interstício e impedimentos legais.",
        unit: "Gestão de Pessoas"
      },
      {
        id: "s4",
        order: 4,
        name: "Homologação / publicação",
        description: "Emissão de portaria ou despacho de concessão e ciência ao servidor.",
        unit: "Autoridade competente"
      },
      {
        id: "s5",
        order: 5,
        name: "Arquivamento",
        description: "Processo concluído e arquivado após o gozo das férias.",
        unit: "Arquivo"
      }
    ]
  },
  {
    id: "flow-licenca-cap",
    processType: "Licença Capacitação",
    description: "Fluxo de pedido de licença para capacitação.",
    active: true,
    steps: [
      {
        id: "s1",
        order: 1,
        name: "Protocolo do pedido",
        description: "Servidor anexa plano de capacitação e documentos comprobatórios.",
        unit: "Unidade de origem"
      },
      {
        id: "s2",
        order: 2,
        name: "Parecer da chefia",
        description: "Avaliação de impacto na unidade e alinhamento com as atividades.",
        unit: "Chefia imediata"
      },
      {
        id: "s3",
        order: 3,
        name: "Análise técnica de capacitação",
        description: "Verificação de elegibilidade e enquadramento normativo.",
        unit: "Capacitação / RH"
      },
      {
        id: "s4",
        order: 4,
        name: "Decisão da autoridade",
        description: "Deferimento ou indeferimento fundamentado.",
        unit: "Autoridade competente"
      },
      {
        id: "s5",
        order: 5,
        name: "Registro e arquivamento",
        description: "Atualização funcional e arquivamento do processo.",
        unit: "Gestão de Pessoas"
      }
    ]
  },
  {
    id: "flow-contratacao",
    processType: "Contratação",
    description: "Fluxo genérico de contratação (simplificado para demonstração).",
    active: true,
    steps: [
      {
        id: "s1",
        order: 1,
        name: "Demanda e DFD",
        description: "Elaboração do Documento de Formalização da Demanda.",
        unit: "Área demandante"
      },
      {
        id: "s2",
        order: 2,
        name: "Estudos preliminares / ETP",
        description: "Análise de solução, riscos e estimativa de preços.",
        unit: "Planejamento da contratação"
      },
      {
        id: "s3",
        order: 3,
        name: "TR / Projeto básico",
        description: "Especificação técnica e quantitativos.",
        unit: "Área técnica"
      },
      {
        id: "s4",
        order: 4,
        name: "Análise jurídica",
        description: "Parecer sobre a modalidade e minutas.",
        unit: "Procuradoria / Jurídico"
      },
      {
        id: "s5",
        order: 5,
        name: "Empenho e contratação",
        description: "Autorização, empenho e assinatura do instrumento contratual.",
        unit: "Administração / Ordenador"
      },
      {
        id: "s6",
        order: 6,
        name: "Gestão e fiscalização",
        description: "Acompanhamento da execução e pagamentos.",
        unit: "Fiscal do contrato"
      }
    ]
  },
  {
    id: "flow-acesso-info",
    processType: "Acesso à Informação",
    description: "Fluxo de atendimento a pedidos de acesso à informação (LAI).",
    active: true,
    steps: [
      {
        id: "s1",
        order: 1,
        name: "Recebimento do pedido",
        description: "Registro do pedido no SIC / SEI e classificação inicial.",
        unit: "SIC / Ouvidoria"
      },
      {
        id: "s2",
        order: 2,
        name: "Encaminhamento à área detentora",
        description: "Identificação e tramitação para a unidade detentora da informação.",
        unit: "SIC"
      },
      {
        id: "s3",
        order: 3,
        name: "Busca e manifestação",
        description: "Área localiza a informação e elabora resposta ou justifica negativa.",
        unit: "Unidade detentora"
      },
      {
        id: "s4",
        order: 4,
        name: "Resposta ao cidadão",
        description: "Envio da resposta dentro do prazo legal.",
        unit: "SIC"
      },
      {
        id: "s5",
        order: 5,
        name: "Arquivamento",
        description: "Conclusão e arquivamento após cumprimento ou recurso final.",
        unit: "SIC"
      }
    ]
  },
  {
    id: "flow-diarias",
    processType: "Diárias e Passagens",
    description: "Fluxo de solicitação de diárias e passagens.",
    active: true,
    steps: [
      {
        id: "s1",
        order: 1,
        name: "Solicitação da viagem",
        description: "Preenchimento do pedido com justificativa, datas e destino.",
        unit: "Servidor / Unidade"
      },
      {
        id: "s2",
        order: 2,
        name: "Autorização da chefia",
        description: "Validação da necessidade e da oportunidade da viagem.",
        unit: "Chefia"
      },
      {
        id: "s3",
        order: 3,
        name: "Análise orçamentária",
        description: "Verificação de saldo e emissão de empenho, se aplicável.",
        unit: "Orçamento / Financeiro"
      },
      {
        id: "s4",
        order: 4,
        name: "Emissão de diárias/passagens",
        description: "Processamento no SCDP ou sistema equivalente.",
        unit: "Administrativo"
      },
      {
        id: "s5",
        order: 5,
        name: "Prestação de contas",
        description: "Relatório de viagem e documentos comprobatórios.",
        unit: "Servidor"
      }
    ]
  }
];

if (typeof globalThis !== "undefined") {
  globalThis.SEI_FLUXO_DEFAULTS = SEI_FLUXO_DEFAULTS;
}
