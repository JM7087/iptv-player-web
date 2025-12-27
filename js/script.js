// Elementos do DOM - serão inicializados quando o DOM estiver pronto
let playlistUrlInput, btnCarregar, buscaInput, listaCanais, videoPlayer;
let videoOverlay, canalAtual, totalCanais, filtroCategoria;
let epgUrlInput, btnCarregarEpg, epgContent, epgStatus;

// Armazenar canais e EPG
let canais = [];
let canaisFiltrados = [];
let categorias = new Set();
let hlsInstance = null;
let epgData = {};
let canalAtualObj = null;

// Configurações de renderização virtual
const ITENS_POR_PAGINA = 50;
const ITENS_CARREGAR_MAIS = 50;
let itensExibidos = 0;
let categoriaAtual = 'todos';
let termosBusca = '';

// Debounce para busca
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Inicializar elementos do DOM
function inicializarElementos() {
    playlistUrlInput = document.getElementById('playlist-url');
    btnCarregar = document.getElementById('btn-carregar');
    buscaInput = document.getElementById('busca-canal');
    listaCanais = document.getElementById('lista-canais');
    videoPlayer = document.getElementById('player');
    videoOverlay = document.getElementById('video-overlay');
    canalAtual = document.getElementById('canal-atual');
    totalCanais = document.getElementById('total-canais');
    filtroCategoria = document.getElementById('filtro-categoria');
    epgUrlInput = document.getElementById('epg-url');
    btnCarregarEpg = document.getElementById('btn-carregar-epg');
    epgContent = document.getElementById('epg-content');
    epgStatus = document.getElementById('epg-status');
    
    console.log('Elementos inicializados:', {
        buscaInput: !!buscaInput,
        filtroCategoria: !!filtroCategoria,
        listaCanais: !!listaCanais
    });
}

// Configurar event listeners
function configurarEventListeners() {
    // Evento de carregar playlist
    if (btnCarregar) {
        btnCarregar.addEventListener('click', () => {
            const url = playlistUrlInput.value.trim();
            if (url) {
                localStorage.setItem('playlistUrl', url);
                carregarPlaylist(url);
            } else {
                alert('Por favor, insira uma URL válida da playlist M3U');
            }
        });
    }

    // Carregar playlist ao pressionar Enter
    if (playlistUrlInput) {
        playlistUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                btnCarregar.click();
            }
        });
    }

    // Evento de carregar EPG
    if (btnCarregarEpg) {
        btnCarregarEpg.addEventListener('click', () => {
            const url = epgUrlInput.value.trim();
            if (url) {
                localStorage.setItem('epgUrl', url);
                carregarEPG(url);
            } else {
                alert('Por favor, insira uma URL válida do EPG');
            }
        });
    }

    if (epgUrlInput) {
        epgUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                btnCarregarEpg.click();
            }
        });
    }

    // Event listener para busca
    if (buscaInput) {
        buscaInput.addEventListener('input', (e) => {
            const valor = e.target.value.trim().toLowerCase();
            termosBusca = valor;
            if (totalCanais) totalCanais.textContent = 'Buscando...';
            
            // Debounce manual
            clearTimeout(buscaInput.debounceTimer);
            buscaInput.debounceTimer = setTimeout(() => {
                console.log('Executando busca:', termosBusca);
                aplicarFiltros();
            }, 400);
        });
        console.log('✓ Busca configurada');
    } else {
        console.error('✗ Elemento busca-canal não encontrado!');
    }

    // Filtro por categoria
    if (filtroCategoria) {
        filtroCategoria.addEventListener('change', (e) => {
            categoriaAtual = e.target.value;
            console.log('Categoria selecionada:', categoriaAtual);
            aplicarFiltros();
        });
        console.log('✓ Filtro categoria configurado');
    } else {
        console.error('✗ Elemento filtro-categoria não encontrado!');
    }

    // Scroll infinito
    if (listaCanais) {
        listaCanais.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = listaCanais;
            if (scrollTop + clientHeight >= scrollHeight - 100) {
                if (itensExibidos < canaisFiltrados.length) {
                    const btn = listaCanais.querySelector('.carregar-mais');
                    if (btn) btn.remove();
                    renderizarCanais(false);
                }
            }
        });
    }
}

// Carregar dados salvos
function carregarDadosSalvos() {
    const urlSalva = localStorage.getItem('playlistUrl');
    const epgSalvo = localStorage.getItem('epgUrl');
    
    if (urlSalva && playlistUrlInput) {
        playlistUrlInput.value = urlSalva;
        carregarPlaylist(urlSalva);
    }
    
    if (epgSalvo && epgUrlInput) {
        epgUrlInput.value = epgSalvo;
        carregarEPG(epgSalvo);
    }
}

// Inicialização principal
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM carregado - Iniciando aplicação...');
    inicializarElementos();
    configurarEventListeners();
    carregarDadosSalvos();
});

// Função para carregar a playlist
function carregarPlaylist(url) {
    btnCarregar.disabled = true;
    btnCarregar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
    totalCanais.textContent = 'Carregando...';
    
    fetch(url)
        .then(resposta => {
            if (!resposta.ok) throw new Error('Erro ao carregar playlist');
            return resposta.text();
        })
        .then(conteudo => {
            // Processar em chunks para não travar
            processarPlaylistEmChunks(conteudo);
        })
        .catch(erro => {
            console.error('Erro:', erro);
            alert('Erro ao carregar a playlist. Verifique a URL e tente novamente.');
            btnCarregar.disabled = false;
            btnCarregar.innerHTML = '<i class="fas fa-download"></i> Carregar';
            totalCanais.textContent = '0 canais';
        });
}

// Processar playlist em chunks para não travar o navegador
function processarPlaylistEmChunks(conteudo) {
    const linhas = conteudo.split('\n');
    const totalLinhas = linhas.length;
    let index = 0;
    let canalInfo = {};
    
    canais = [];
    categorias = new Set(['todos']);
    
    // Pré-compilar expressões regulares (muito mais rápido)
    const regexNome = /,(.+)$/;
    const regexLogo = /tvg-logo="([^"]+)"/;
    const regexGrupo = /group-title="([^"]+)"/;
    const regexTvgId = /tvg-id="([^"]+)"/;
    const regexTvgName = /tvg-name="([^"]+)"/;
    
    // Tentar extrair URL do EPG do cabeçalho da playlist
    const epgMatch = conteudo.match(/x-tvg-url="([^"]+)"/i) || 
                     conteudo.match(/url-tvg="([^"]+)"/i);
    if (epgMatch && epgUrlInput && !epgUrlInput.value) {
        epgUrlInput.value = epgMatch[1];
        localStorage.setItem('epgUrl', epgMatch[1]);
        carregarEPG(epgMatch[1]);
    }
    
    // Processar em chunks maiores
    const CHUNK_SIZE = 5000; // Processar 5000 linhas por vez
    
    function processarChunk() {
        const fimChunk = Math.min(index + CHUNK_SIZE, totalLinhas);
        
        while (index < fimChunk) {
            const linha = linhas[index];
            
            // Verificação rápida sem trim
            if (linha.length > 7 && linha.charCodeAt(0) === 35) { // '#'
                if (linha.indexOf('#EXTINF') === 0) {
                    const match = regexNome.exec(linha);
                    canalInfo.nome = match ? match[1].trim() : 'Canal sem nome';
                    
                    const logoMatch = regexLogo.exec(linha);
                    canalInfo.logo = logoMatch ? logoMatch[1] : null;
                    
                    const grupoMatch = regexGrupo.exec(linha);
                    canalInfo.grupo = grupoMatch ? grupoMatch[1] : 'Sem categoria';
                    
                    const tvgIdMatch = regexTvgId.exec(linha);
                    canalInfo.tvgId = tvgIdMatch ? tvgIdMatch[1] : null;
                    
                    const tvgNameMatch = regexTvgName.exec(linha);
                    canalInfo.tvgName = tvgNameMatch ? tvgNameMatch[1] : null;
                    
                    if (canalInfo.grupo) {
                        categorias.add(canalInfo.grupo);
                    }
                }
            } else if (linha.length > 4 && linha.indexOf('http') === 0) {
                canalInfo.url = linha.trim();
                canalInfo.id = canais.length;
                canais.push(canalInfo);
                canalInfo = {};
            }
            
            index++;
        }
        
        // Atualizar progresso a cada 10%
        const progresso = Math.round((index / totalLinhas) * 100);
        if (totalCanais) totalCanais.textContent = `Processando... ${progresso}%`;
        
        if (index < totalLinhas) {
            // Usar setTimeout para não bloquear a UI
            setTimeout(processarChunk, 0);
        } else {
            // Finalizado
            finalizarCarregamento();
        }
    }
    
    // Iniciar processamento
    setTimeout(processarChunk, 0);
}

// Finalizar carregamento
function finalizarCarregamento() {
    btnCarregar.disabled = false;
    btnCarregar.innerHTML = '<i class="fas fa-download"></i> Carregar';
    
    // Popular filtro de categorias
    popularFiltroCategoria();
    
    // Aplicar filtros e renderizar
    aplicarFiltros();
    
    console.log(`Carregados ${canais.length} canais em ${categorias.size - 1} categorias`);
}

// Popular dropdown de categorias
function popularFiltroCategoria() {
    if (!filtroCategoria) return;
    
    filtroCategoria.innerHTML = '<option value="todos">📁 Todas as categorias</option>';
    
    // Ordenar categorias alfabeticamente
    const categoriasOrdenadas = Array.from(categorias).filter(c => c !== 'todos').sort();
    
    categoriasOrdenadas.forEach(categoria => {
        const option = document.createElement('option');
        option.value = categoria;
        option.textContent = categoria;
        filtroCategoria.appendChild(option);
    });
}

// Aplicar filtros (busca + categoria)
function aplicarFiltros() {
    console.log('Aplicando filtros - Termo:', termosBusca, 'Categoria:', categoriaAtual);
    
    canaisFiltrados = [];
    
    for (let i = 0; i < canais.length; i++) {
        const canal = canais[i];
        
        // Filtro de categoria
        if (categoriaAtual !== 'todos' && canal.grupo !== categoriaAtual) {
            continue;
        }
        
        // Filtro de busca
        if (termosBusca && termosBusca.length > 0) {
            const nomeLower = canal.nome.toLowerCase();
            const grupoLower = canal.grupo.toLowerCase();
            if (!nomeLower.includes(termosBusca) && !grupoLower.includes(termosBusca)) {
                continue;
            }
        }
        
        canaisFiltrados.push(canal);
    }
    
    console.log('Canais filtrados:', canaisFiltrados.length);
    
    // Reset da paginação
    itensExibidos = 0;
    
    // Atualizar contador
    totalCanais.textContent = `${canaisFiltrados.length} de ${canais.length} canais`;
    
    // Renderizar primeira página
    renderizarCanais(true);
}

// Renderizar lista de canais (virtual/paginado)
function renderizarCanais(limpar = false) {
    if (limpar) {
        listaCanais.innerHTML = '';
        itensExibidos = 0;
    }

    if (canaisFiltrados.length === 0) {
        listaCanais.innerHTML = `
            <li class="empty-state">
                <i class="fas fa-search"></i>
                <p>Nenhum canal encontrado</p>
                <small>Tente outro termo ou categoria</small>
            </li>
        `;
        return;
    }

    // Pegar próximos itens
    const proximosItens = canaisFiltrados.slice(itensExibidos, itensExibidos + ITENS_CARREGAR_MAIS);
    
    // Usar DocumentFragment para performance
    const fragment = document.createDocumentFragment();
    
    proximosItens.forEach((canal) => {
        const li = document.createElement('li');
        li.className = 'canal-item';
        li.dataset.id = canal.id;
        li.innerHTML = `
            <div class="canal-logo">
                ${canal.logo ? `<img src="${canal.logo}" alt="" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : ''}
                <i class="fas fa-tv" style="${canal.logo ? 'display:none' : ''}"></i>
            </div>
            <div class="canal-info">
                <span class="canal-nome">${escapeHtml(canal.nome)}</span>
                <span class="canal-grupo">${escapeHtml(canal.grupo)}</span>
            </div>
        `;
        li.onclick = () => tocarCanal(canal, li);
        fragment.appendChild(li);
    });
    
    // Remover botão "carregar mais" anterior se existir
    const btnAnterior = listaCanais.querySelector('.carregar-mais');
    if (btnAnterior) btnAnterior.remove();
    
    listaCanais.appendChild(fragment);
    itensExibidos += proximosItens.length;
    
    // Adicionar botão "Carregar mais" se houver mais itens
    if (itensExibidos < canaisFiltrados.length) {
        const btnCarregarMais = document.createElement('li');
        btnCarregarMais.className = 'carregar-mais';
        btnCarregarMais.innerHTML = `
            <button onclick="renderizarCanais(false)">
                <i class="fas fa-plus-circle"></i>
                Carregar mais (${canaisFiltrados.length - itensExibidos} restantes)
            </button>
        `;
        listaCanais.appendChild(btnCarregarMais);
    }
}

// Escape HTML para prevenir XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Função para tocar canal
function tocarCanal(canal, elemento) {
    // Remover classe ativo de todos
    document.querySelectorAll('.canal-item').forEach(item => item.classList.remove('ativo'));
    
    // Adicionar classe ativo ao canal selecionado
    if (elemento) {
        elemento.classList.add('ativo');
    }
    
    // Esconder overlay
    if (videoOverlay) videoOverlay.style.display = 'none';
    
    // Atualizar nome do canal atual
    if (canalAtual) canalAtual.textContent = canal.nome;

    // Destruir instância HLS anterior se existir
    if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
    }

    if (Hls.isSupported()) {
        hlsInstance = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            maxBufferLength: 30,
            maxMaxBufferLength: 60
        });
        hlsInstance.loadSource(canal.url);
        hlsInstance.attachMedia(videoPlayer);
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            videoPlayer.play().catch(e => console.log('Autoplay bloqueado'));
        });
        hlsInstance.on(Hls.Events.ERROR, (event, data) => {
            console.error('HLS Error:', data);
            if (data.fatal) {
                switch(data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        hlsInstance.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        hlsInstance.recoverMediaError();
                        break;
                    default:
                        console.error('Erro fatal, não é possível recuperar');
                        break;
                }
            }
        });
    } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        videoPlayer.src = canal.url;
        videoPlayer.play().catch(e => console.log('Autoplay bloqueado'));
    } else {
        alert('Seu navegador não suporta reprodução HLS');
    }
}
