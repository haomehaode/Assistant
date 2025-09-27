// CDP页面分析器：获取可视区域的CDP DOM树结构
class PageAnalyzer {
  constructor() {
    this.nodeIdCounter = 0;
  }

  // 获取CDP格式的页面信息（仅可视区域）
  async getPageInfo() {
    try {
      console.log('开始获取可视区域CDP DOM树...');
      
      const info = {
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
        viewport: this.getViewportInfo(),
        // CDP格式的DOM树（仅可视区域）
        dom: this.getVisibleCDPDOMTree()
      };
      
      console.log('可视区域CDP DOM树获取成功');
      return info;
    } catch (error) {
      console.error('获取可视区域CDP DOM树失败:', error);
      throw error;
    }
  }

  // 获取可视区域信息
  getViewportInfo() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scrollMaxX: document.documentElement.scrollWidth - window.innerWidth,
      scrollMaxY: document.documentElement.scrollHeight - window.innerHeight
    };
  }

  // 获取可视区域的CDP格式DOM树
  getVisibleCDPDOMTree() {
    try {
      console.log('开始生成可视区域CDP DOM树...');
      
      const rootNode = {
        nodeId: this.generateNodeId(document.documentElement),
        nodeType: 1, // ELEMENT_NODE
        nodeName: document.documentElement.tagName ? document.documentElement.tagName.toLowerCase() : 'html',
        nodeValue: null,
        attributes: this.getAllAttributes(document.documentElement),
        children: this.getVisibleCDPChildren(document.documentElement)
      };
      
      console.log('可视区域CDP DOM树生成成功');
      return rootNode;
    } catch (error) {
      console.error('生成可视区域CDP DOM树失败:', error);
      throw error;
    }
  }

  // 获取可视区域的CDP格式子节点
  getVisibleCDPChildren(element) {
    const children = [];
    const childNodes = Array.from(element.childNodes);
    
    childNodes.forEach((child) => {
      try {
        if (child.nodeType === 1) { // ELEMENT_NODE
          const rect = child.getBoundingClientRect();
          const style = window.getComputedStyle(child);
          
          // 只包含可视区域内的可见元素
          if (this.isElementVisible(child, rect, style) && this.isElementInViewport(rect)) {
            const nodeId = this.generateNodeId(child);
            child.setAttribute('data-node-id', nodeId);
            
            children.push({
              nodeId: nodeId,
              nodeType: child.nodeType,
              nodeName: child.tagName ? child.tagName.toLowerCase() : 'unknown',
              nodeValue: null,
              attributes: this.getAllAttributes(child),
              children: this.getVisibleCDPChildren(child)
            });
          }
        } else if (child.nodeType === 3) { // TEXT_NODE
          const text = child.textContent?.trim();
          if (text && text.length > 0) {
            // 检查文本节点是否在可视区域内
            const parentElement = child.parentElement;
            if (parentElement) {
              const rect = parentElement.getBoundingClientRect();
              if (this.isElementInViewport(rect)) {
                children.push({
                  nodeId: this.generateNodeId(child),
                  nodeType: child.nodeType,
                  nodeName: '#text',
                  nodeValue: text,
                  attributes: {},
                  children: []
                });
              }
            }
          }
        }
      } catch (childError) {
        console.warn('处理子节点时出错:', childError);
      }
    });
    
    return children;
  }

  // 检查元素是否可见
  isElementVisible(element, rect, style) {
    return rect.width > 0 && rect.height > 0 && 
           style.display !== 'none' && 
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
  }

  // 检查元素是否在可视区域内
  isElementInViewport(rect) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 元素与可视区域有交集即认为在可视区域内
    return rect.right > 0 && 
           rect.left < viewportWidth && 
           rect.bottom > 0 && 
           rect.top < viewportHeight;
  }

  // 生成CDP nodeid
  generateNodeId(element) {
    return this.nodeIdCounter++;
  }

  // 获取所有元素属性
  getAllAttributes(element) {
    const attrs = {};
    if (element.attributes) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        attrs[attr.name] = attr.value;
      }
    }
    return attrs;
  }
}

// 导出页面分析器
window.PageAnalyzer = PageAnalyzer;
